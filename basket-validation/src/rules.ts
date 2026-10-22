// Pure business rules for the M&S UK basket validation extension. No I/O so they are easy to test.

export const RESTRICTED_QUANTITY_LIMIT = 12; // max age-restricted units per order (demo assumption, configurable)
// Postcode areas with no delivery of any kind (M&S help page)
export const NO_DELIVERY_AREAS = ['GX', 'JE', 'BF'];
// Areas where alcohol, hampers and wine are not delivered (M&S "Hampers & Wine" exclusions, area-level only)
export const NO_ALCOHOL_AREAS = ['BT', 'GY', 'HS', 'IM', 'JE', 'ZE', 'GX'];
export const LOCKER_METHOD_KEY = 'click-collect-locker';

export type Attr = { name: string; value: unknown };
export type LineItem = { quantity: number; name?: Record<string, string>; variant?: { attributes?: Attr[] } };
export type Cart = {
  id?: string; customerId?: string; shippingAddress?: { postalCode?: string; country?: string };
  lineItems: LineItem[];
  shippingInfo?: { shippingMethod?: { obj?: { key?: string } } ; shippingMethodName?: string };
  custom?: { type?: { id: string }; fields?: Record<string, unknown> };
};

const attr = (li: LineItem, name: string): string | undefined => {
  const v = li.variant?.attributes?.find(a => a.name === name)?.value as any;
  return v && typeof v === 'object' && 'key' in v ? v.key : v;
};
export const isRestricted = (li: LineItem) => attr(li, 'ageRestriction') === '18' || attr(li, 'restrictionClass') === 'alcohol';

export const postcodeArea = (pc?: string) => {
  const m = (pc ?? '').toUpperCase().trim().match(/^([A-Z]{1,2})\d/);
  return m ? m[1] : undefined;
};

export type Facts = { restrictedItemsPresent: boolean; restrictedQuantity: number; deliveryClasses: string[]; postcodeArea?: string };
export const computeFacts = (cart: Cart): Facts => {
  const restricted = cart.lineItems.filter(isRestricted);
  const classes = [...new Set(cart.lineItems.map(li => attr(li, 'deliveryClass')).filter((x): x is string => !!x))].sort();
  return { restrictedItemsPresent: restricted.length > 0, restrictedQuantity: restricted.reduce((n, li) => n + li.quantity, 0),
    deliveryClasses: classes, postcodeArea: postcodeArea(cart.shippingAddress?.postalCode) };
};

export type Violation = { code: string; message: string };
const nm = (li: LineItem) => li.name?.['en-GB'] ?? 'item';

/** Rules that apply on every cart change. */
export const validateCart = (cart: Cart, facts = computeFacts(cart)): Violation[] => {
  const v: Violation[] = [];
  const area = facts.postcodeArea;
  if (facts.restrictedQuantity > RESTRICTED_QUANTITY_LIMIT)
    v.push({ code: 'MS_RESTRICTED_QTY', message: `You can buy up to ${RESTRICTED_QUANTITY_LIMIT} age-restricted items per order.` });
  if (area && NO_DELIVERY_AREAS.includes(area))
    v.push({ code: 'MS_NO_DELIVERY_AREA', message: `We can't deliver to ${area} postcodes.` });
  if (area && facts.restrictedItemsPresent && NO_ALCOHOL_AREAS.includes(area)) {
    const names = cart.lineItems.filter(isRestricted).map(nm).join(', ');
    v.push({ code: 'MS_RESTRICTED_AREA', message: `Age-restricted items (${names}) can't be delivered to ${area} postcodes.` });
  }
  const method = cart.shippingInfo?.shippingMethod?.obj?.key;
  if (method === LOCKER_METHOD_KEY && facts.restrictedItemsPresent)
    v.push({ code: 'MS_RESTRICTED_LOCKER', message: 'Age-restricted items cannot be collected from a parcel locker. Choose store collection or home delivery.' });
  return v;
};

export const ageFromDob = (dob: string, today = new Date()) => {
  const d = new Date(dob + 'T00:00:00Z'); let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
};

/** Extra gate when an order is created from the cart: 18+ must be confirmed. */
export const validateOrder = (cart: Cart, dateOfBirth?: string, facts = computeFacts(cart), today = new Date()): Violation[] => {
  const v = validateCart(cart, facts);
  if (!facts.restrictedItemsPresent) return v;
  const declared = cart.custom?.fields?.ageDeclaration === true;
  if (dateOfBirth) {
    if (ageFromDob(dateOfBirth, today) < 18)
      v.push({ code: 'MS_UNDER_AGE', message: 'Your account date of birth shows you are under 18, so we can\'t sell you age-restricted items.' });
  } else if (!declared) {
    v.push({ code: 'MS_AGE_CHECK', message: 'Please confirm you are 18 or over to buy age-restricted items. You may be asked for ID on delivery or collection.' });
  }
  return v;
};

/** Helper fields on the cart that shipping predicates and the storefront read. */
export const desiredCustomFields = (facts: Facts) => ({
  restrictedItemsPresent: facts.restrictedItemsPresent,
  ageCheckRequired: facts.restrictedItemsPresent,
  deliveryClasses: facts.deliveryClasses,
  ...(facts.postcodeArea ? { postcodeArea: facts.postcodeArea } : {}),
});

export const customFieldActions = (cart: Cart, facts: Facts, typeKey = 'ms-cart-order') => {
  const want = desiredCustomFields(facts);
  if (!cart.custom?.type) return [{ action: 'setCustomType', type: { typeId: 'type', key: typeKey }, fields: want }];
  const have = cart.custom.fields ?? {};
  return Object.entries(want).filter(([k, val]) => JSON.stringify(have[k]) !== JSON.stringify(val)).map(([name, value]) => ({ action: 'setCustomField', name, value }));
};

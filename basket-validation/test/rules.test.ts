import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCart, validateOrder, computeFacts, customFieldActions, postcodeArea } from '../src/rules.js';
import { handle } from '../src/handler.js';

const li = (q: number, attrs: Record<string, string>) => ({ quantity: q, name: { 'en-GB': 'Gavi White Wine Gift' },
  variant: { attributes: Object.entries(attrs).map(([name, value]) => ({ name, value: name === 'ageRestriction' || name === 'deliveryClass' || name === 'restrictionClass' ? { key: value } : value })) } });
const wine = (q = 1) => li(q, { ageRestriction: '18', restrictionClass: 'alcohol', deliveryClass: 'hamper-wine' });
const jumper = (q = 1) => li(q, { ageRestriction: 'none', restrictionClass: 'none', deliveryClass: 'parcel' });

test('postcode area parsing', () => { assert.equal(postcodeArea('BT1 1AA'), 'BT'); assert.equal(postcodeArea('w1c 1ap'), 'W'); assert.equal(postcodeArea('NR20 3DZ'), 'NR'); });
test('non-restricted cart is valid and gets flags', () => {
  const cart = { lineItems: [jumper()], shippingAddress: { postalCode: 'NR2 1QR' } };
  assert.deepEqual(validateCart(cart), []);
  const a = customFieldActions(cart, computeFacts(cart)) as any[];
  assert.equal(a[0].action, 'setCustomType'); assert.equal(a[0].fields.restrictedItemsPresent, false); assert.equal(a[0].fields.postcodeArea, 'NR');
});
test('alcohol blocked to Northern Ireland and Channel Islands', () => {
  for (const pc of ['BT1 1AA', 'GY1 1AA', 'ZE1 0AA']) assert.equal(validateCart({ lineItems: [wine()], shippingAddress: { postalCode: pc } }).some(x => x.code === 'MS_RESTRICTED_AREA'), true, pc);
  assert.equal(validateCart({ lineItems: [jumper()], shippingAddress: { postalCode: 'BT1 1AA' } }).length, 0);
  assert.equal(validateCart({ lineItems: [jumper()], shippingAddress: { postalCode: 'JE2 3AA' } })[0].code, 'MS_NO_DELIVERY_AREA');
});
test('alcohol cannot go to a locker', () => {
  const cart = { lineItems: [wine()], shippingInfo: { shippingMethod: { obj: { key: 'click-collect-locker' } } } };
  assert.equal(validateCart(cart)[0].code, 'MS_RESTRICTED_LOCKER');
});
test('quantity cap', () => assert.equal(validateCart({ lineItems: [wine(13)] })[0].code, 'MS_RESTRICTED_QTY'));
test('order needs age confirmation, DOB check wins', () => {
  const cart = { lineItems: [wine()] };
  assert.equal(validateOrder(cart)[0].code, 'MS_AGE_CHECK');
  assert.deepEqual(validateOrder({ ...cart, custom: { type: { id: 't' }, fields: { ageDeclaration: true } } }), []);
  assert.deepEqual(validateOrder(cart, '1980-05-01'), []);
  assert.equal(validateOrder({ ...cart, custom: { type: { id: 't' }, fields: { ageDeclaration: true } } }, '2012-01-01', undefined, new Date('2026-10-22'))[0].code, 'MS_UNDER_AGE');
});
test('handler: 400 on violation, fails open on error', async () => {
  const bad = await handle({ action: 'Update', resource: { typeId: 'cart', obj: { lineItems: [wine()], shippingAddress: { postalCode: 'BT1 1AA' } } } });
  assert.equal(bad.status, 400); assert.match(bad.body.errors[0].message, /MS_RESTRICTED_AREA/);
  const open = await handle({ action: 'Update', resource: { typeId: 'cart', obj: null } });
  assert.equal(open.status, 200);
  const ord = await handle({ action: 'Create', resource: { typeId: 'order', obj: { customerId: 'c1', lineItems: [wine()] } } }, { getCustomerDob: async () => '2015-01-01' });
  assert.equal(ord.status, 400);
});

test('split baskets: every delivery group address is checked', () => {
  const cart = { lineItems: [wine()], shipping: [{ shippingKey: 'parcel', shippingAddress: { postalCode: 'NR2 1QR' } }, { shippingKey: 'other', shippingAddress: { postalCode: 'BT1 1AA' } }] };
  assert.equal(validateCart(cart).some((x) => x.code === 'MS_RESTRICTED_AREA'), true);
  const locker = { lineItems: [wine()], shipping: [{ shippingKey: 'p', shippingInfo: { shippingMethod: { key: 'click-collect-locker' } } }] };
  assert.equal(validateCart(locker).some((x) => x.code === 'MS_RESTRICTED_LOCKER'), true);
});
test('one chosen gift, quantity 1', () => {
  const g = (q: number) => ({ ...jumper(q), custom: { fields: { giftSelection: 'gift-choice-women-50' } } });
  assert.deepEqual(validateCart({ lineItems: [jumper(), g(1)] }), []);
  assert.equal(validateCart({ lineItems: [g(2)] })[0].code, 'MS_GIFT_LIMIT');
  assert.equal(validateCart({ lineItems: [g(1), g(1)] })[0].code, 'MS_GIFT_LIMIT');
});

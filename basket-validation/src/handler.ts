import { Cart, computeFacts, customFieldActions, validateCart, validateOrder, Violation } from './rules.js';

export type ExtensionInput = { action: 'Create' | 'Update'; resource: { typeId: 'cart' | 'order'; id?: string; obj: any } };
export type ExtensionResult = { status: 200 | 400; body: any };

export type Deps = { getCustomerDob?: (customerId: string) => Promise<string | undefined>; log?: (m: string, e?: unknown) => void };

const reject = (violations: Violation[]): ExtensionResult => ({ status: 400, body: {
  errors: violations.map(v => ({ code: 'InvalidOperation', message: `[${v.code}] ${v.message}` })) } });

/** Fail open on our own errors: an outage here must not block every cart call (extensions affect all clients). */
export async function handle(input: ExtensionInput, deps: Deps = {}): Promise<ExtensionResult> {
  try {
    const obj = input.resource.obj as Cart;
    const facts = computeFacts(obj);
    if (input.resource.typeId === 'order') {
      const dob = obj.customerId && deps.getCustomerDob ? await deps.getCustomerDob(obj.customerId) : undefined;
      const v = validateOrder(obj, dob, facts);
      return v.length ? reject(v) : { status: 200, body: { actions: [] } };
    }
    const v = validateCart(obj, facts);
    if (v.length) return reject(v);
    return { status: 200, body: { actions: customFieldActions(obj, facts) } };
  } catch (e) {
    deps.log?.('basket-validation internal error, failing open', e);
    return { status: 200, body: { actions: [] } };
  }
}

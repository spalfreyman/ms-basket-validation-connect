// Connect post-deploy: register (or update) the API Extension that points at this service.
const E = (k: string) => process.env[k] ?? '';
async function token() {
  const r = await fetch(`${E('CTP_AUTH_URL')}/oauth/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${E('CTP_CLIENT_ID')}:${E('CTP_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: E('CTP_SCOPES') }) });
  return ((await r.json()) as any).access_token as string;
}
export const EXTENSION_KEY = 'ms-basket-validation';
export const extensionBody = (url: string, secret?: string) => ({
  key: EXTENSION_KEY,
  destination: { type: 'HTTP', url, ...(secret ? { authentication: { type: 'AuthorizationHeader', headerValue: secret } } : {}) },
  triggers: [{ resourceTypeId: 'cart', actions: ['Create', 'Update'] }, { resourceTypeId: 'order', actions: ['Create'] }],
  timeoutInMs: Number(process.env.EXTENSION_TIMEOUT_MS ?? 10000) }); // sandbox deployments cold-start, so allow more than the 2s default
async function main() {
  const api = `${E('CTP_API_URL')}/${E('CTP_PROJECT_KEY')}/extensions`;
  const h = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
  const body = extensionBody(E("CONNECT_SERVICE_URL"), E('EXTENSION_SHARED_SECRET') || undefined);
  const cur = await fetch(`${api}/key=${EXTENSION_KEY}`, { headers: h });
  if (cur.ok) { const c: any = await cur.json();
    await fetch(`${api}/key=${EXTENSION_KEY}`, { method: 'POST', headers: h, body: JSON.stringify({ version: c.version, actions: [{ action: 'changeDestination', destination: body.destination }, { action: 'changeTriggers', triggers: body.triggers }, { action: 'setTimeoutInMs', timeoutInMs: body.timeoutInMs }] }) });
  } else await fetch(api, { method: 'POST', headers: h, body: JSON.stringify(body) });
  console.log('extension registered');
}
if (process.argv[1]?.endsWith('post-deploy.js')) main().catch(e => { console.error(e); process.exit(1); });

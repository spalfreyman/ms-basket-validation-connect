// Minimal commercetools client (client credentials) for the customer lookup used by the order check.
let tok = { t: '', exp: 0 };
const env = (k: string) => process.env[k] ?? '';
async function token() {
  if (Date.now() < tok.exp - 60_000) return tok.t;
  const r = await fetch(`${env('CTP_AUTH_URL')}/oauth/token`, { method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${env('CTP_CLIENT_ID')}:${env('CTP_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: env('CTP_SCOPES') }) });
  const d: any = await r.json(); tok = { t: d.access_token, exp: Date.now() + d.expires_in * 1000 }; return tok.t;
}
export async function getCustomerDob(id: string): Promise<string | undefined> {
  const r = await fetch(`${env('CTP_API_URL')}/${env('CTP_PROJECT_KEY')}/customers/${id}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!r.ok) return undefined; return ((await r.json()) as any).dateOfBirth;
}

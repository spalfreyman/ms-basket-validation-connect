const E = (k: string) => process.env[k] ?? '';
(async () => {
  const t = await fetch(`${E('CTP_AUTH_URL')}/oauth/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${E('CTP_CLIENT_ID')}:${E('CTP_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: E('CTP_SCOPES') }) }).then(r => r.json()) as any;
  const url = `${E('CTP_API_URL')}/${E('CTP_PROJECT_KEY')}/extensions/key=ms-basket-validation`;
  const h = { Authorization: `Bearer ${t.access_token}` };
  const c = await fetch(url, { headers: h }); if (c.ok) { const x: any = await c.json(); await fetch(`${url}?version=${x.version}`, { method: 'DELETE', headers: h }); }
})().catch(e => { console.error(e); process.exit(1); });

import express from 'express';
import { handle } from './handler.js';
import { getCustomerDob } from './ct.js';

const app = express(); app.use(express.json({ limit: '2mb' }));
const secret = process.env.EXTENSION_SHARED_SECRET;
app.get('/health', (_q, r) => { r.json({ ok: true }); });
app.post('/extension/basket-validation', async (req, res) => {
  if (secret && req.header('authorization') !== secret) return res.status(401).end();
  const out = await handle(req.body, { getCustomerDob, log: (m, e) => console.error(m, e) });
  res.status(out.status).json(out.body);
});
app.listen(Number(process.env.PORT ?? 8080), () => console.log('ms-basket-validation listening'));

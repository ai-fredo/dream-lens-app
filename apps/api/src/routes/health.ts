// apps/api/src/routes/health.ts
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

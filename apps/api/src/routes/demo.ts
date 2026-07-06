// apps/api/src/routes/demo.ts
import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { demoLimiter as sharedDemoLimiter } from '../middleware/rateLimit';
import { validate, DemoInterpretSchema } from '../validation/schemas';
import { makeClaude } from '../services/claude';
import { withRetry } from '../services/retry';
import { logger } from '../middleware/logger';

/**
 * Dependencies injected into the demo router.
 * - `anthropic` is the AI client `makeClaude` needs to produce an
 *   interpretation. Tests inject a fake with the same minimal shape
 *   (messages.create); prod builds the real client lazily from env so
 *   importing this module needs no env vars.
 * - `demoLimiter` guards the public interpret route (3/hr per IP in prod).
 *   Injectable so tests can pass a no-op or an always-429 stub (asserting
 *   the limiter is mounted). Defaults to the shared `demoLimiter` middleware.
 */
export interface DemoDeps {
  anthropic: Anthropic;
  demoLimiter?: RequestHandler;
}

/**
 * Public, unauthenticated shape of the demo response — deliberately narrow
 * and snake_case to match the landing page's contract at
 * `${DREAMLENS_API_BASE}/v1/demo/interpret`. Not the same shape as the authed
 * dreams interpret DTO (DreamInterpretation): only 4 fields, singular
 * `question` (first of `questionsToReflectOn`), no symbols/patternNote/
 * generatedAt/modelVersion — the demo has no user history and nothing is
 * persisted.
 */
interface DemoInterpretationDto {
  summary: string;
  themes: string[];
  emotional_tone: string;
  question: string;
}

export function makeDemoRouter(deps: DemoDeps): Router {
  const router = Router();
  const limiter = deps.demoLimiter ?? sharedDemoLimiter;

  // POST /v1/demo/interpret — public, no auth. Rate-limited (3/hr/IP) and
  // capped at 1000 chars (DemoInterpretSchema). No user history/RAG context
  // (empty symbolContext/patternContext) and nothing is persisted here.
  router.post(
    '/v1/demo/interpret',
    limiter,
    validate(DemoInterpretSchema),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { transcript } = req.body as { transcript: string };
        const claude = makeClaude(deps.anthropic);

        let interpretation;
        try {
          interpretation = await withRetry(
            () => claude.interpret({ transcript, symbolContext: '', patternContext: '' }),
            { maxAttempts: 2, baseDelayMs: 200, maxDelayMs: 1000 }, // initial + 1 retry
          );
        } catch {
          // Never log dream content — only the fact that Claude was unavailable.
          logger.warn({ event: 'demo_interpret_degraded', code: 'CLAUDE_UNAVAILABLE' });
          res.status(503).json({
            success: false,
            error: {
              code: 'CLAUDE_UNAVAILABLE',
              message: 'The demo is temporarily unavailable. Please try again shortly.',
            },
          });
          return;
        }

        const dto: DemoInterpretationDto = {
          summary: interpretation.summary,
          themes: interpretation.themes,
          emotional_tone: interpretation.emotionalTone,
          question: interpretation.questionsToReflectOn[0] ?? '',
        };
        res.status(200).json({ success: true, data: dto });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

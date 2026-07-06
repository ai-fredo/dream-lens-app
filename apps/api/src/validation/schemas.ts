// apps/api/src/validation/schemas.ts
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Per engineering standards §4.3: every request body must be validated.
// No raw req.body access anywhere in route handlers.

export const CreateDreamSchema = z.object({
  rawTranscript: z
    .string()
    .min(10, 'Transcript must be at least 10 characters')
    .max(5000, 'Transcript cannot exceed 5000 characters')
    .trim(),
  editedTranscript: z.string().max(5000).trim().nullable().optional(),
  recordedAt: z.string().datetime(),
});

export const UpdateTranscriptSchema = z.object({
  editedTranscript: z.string().min(10).max(5000).trim(),
});

export const DemoInterpretSchema = z.object({
  transcript: z
    .string()
    .min(20, 'Please describe your dream in more detail')
    .max(1000, 'Demo is limited to 1000 characters. Create an account for longer dreams.')
    .trim(),
});

/**
 * Middleware factory: validates req.body against the given Zod schema.
 * On failure, responds 400 with the repo's standard error envelope and
 * does not call next(). On success, replaces req.body with the parsed
 * (and thus sanitized/trimmed) data and calls next().
 */
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: result.error.flatten().fieldErrors,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

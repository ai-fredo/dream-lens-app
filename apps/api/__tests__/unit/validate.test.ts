// apps/api/__tests__/unit/validate.test.ts
import { validate } from '../../src/validation/schemas';
import { CreateDreamSchema } from '../../src/validation/schemas';
// any: minimal Express Response stub — only status/json used by the middleware
const res = () => { const r: any = {}; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

it('400 with field errors when transcript too short', () => {
  const r = res(); let called = false;
  // any: minimal Express Request stub — only body used by the middleware
  validate(CreateDreamSchema)({ body: { rawTranscript: 'hi', recordedAt: new Date().toISOString() } } as any, r, () => { called = true; });
  expect(r.code).toBe(400); expect(called).toBe(false); expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
it('passes and replaces body with parsed data when valid', () => {
  const r = res(); // any: minimal Express Request stub — only body used by the middleware
  const req: any = { body: { rawTranscript: 'x'.repeat(20), recordedAt: new Date().toISOString() } }; let called = false;
  validate(CreateDreamSchema)(req, r, () => { called = true; });
  expect(called).toBe(true);
});

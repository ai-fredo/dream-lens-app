import type { DreamInterpretation, SymbolCategory } from '@dreamlens/shared/types/domain';
import { DreamLensError } from '@dreamlens/shared/types/errors';

it('domain types + error class are importable and shaped correctly', () => {
  const cat: SymbolCategory = 'object';
  const err = new DreamLensError('VALIDATION_ERROR', 'bad');
  const i: DreamInterpretation = {
    summary: 's',
    themes: [],
    symbols: [],
    emotionalTone: 'calm',
    patternNote: null,
    questionsToReflectOn: [],
    generatedAt: new Date(),
    modelVersion: 'claude-sonnet-4-6',
  };
  expect([cat, err.code, i.modelVersion]).toBeDefined();
});

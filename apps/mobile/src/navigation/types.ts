/**
 * Root stack param list for the DreamLens navigation shell.
 *
 * Record is the signed-in home screen; Onboarding/Auth gate entry before
 * that. Review/Interpretation carry the data produced by the record →
 * transcribe → interpret flow (Task 6+); the remaining screens are the
 * signed-in app shell built out in later tasks.
 */
export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Record: undefined;
  Review: { rawTranscript: string; recordedAt: string };
  Interpretation: { dreamId: string } | { localDream: unknown };
  Journal: undefined;
  EntryDetail: { dreamId: string };
  Profile: undefined;
  Settings: undefined;
  Paywall: undefined;
};

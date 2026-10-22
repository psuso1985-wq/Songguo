export const COMMERCIAL_DEMO_STORAGE_KEY = 'songguo-commercial-demo-v1';

export const COMMERCIAL_DEMO_STAGES = [
  'R1_REPORTED',
  'CHECK_VIEWED',
  'D1_RETURNED',
  'R2_REPORTED',
  'D2_ACCEPTED',
] as const;

export type CommercialDemoStage = (typeof COMMERCIAL_DEMO_STAGES)[number];

export type CommercialDemoState = {
  stage: CommercialDemoStage;
};

export const INITIAL_COMMERCIAL_DEMO_STATE: CommercialDemoState = {
  stage: 'R1_REPORTED',
};

export function isCommercialDemoStage(value: unknown): value is CommercialDemoStage {
  return typeof value === 'string' && COMMERCIAL_DEMO_STAGES.includes(value as CommercialDemoStage);
}

export function readCommercialDemoState(value: string | null): CommercialDemoState {
  if (!value) return INITIAL_COMMERCIAL_DEMO_STATE;
  try {
    const parsed = JSON.parse(value) as { stage?: unknown };
    return isCommercialDemoStage(parsed.stage) ? { stage: parsed.stage } : INITIAL_COMMERCIAL_DEMO_STATE;
  } catch {
    return INITIAL_COMMERCIAL_DEMO_STATE;
  }
}

export function nextCommercialDemoStage(stage: CommercialDemoStage): CommercialDemoStage {
  const index = COMMERCIAL_DEMO_STAGES.indexOf(stage);
  return COMMERCIAL_DEMO_STAGES[Math.min(index + 1, COMMERCIAL_DEMO_STAGES.length - 1)];
}

export function commercialDemoStageIndex(stage: CommercialDemoStage): number {
  return COMMERCIAL_DEMO_STAGES.indexOf(stage);
}

export type CommercialDemoGapStatus = 'NOT_VIEWED' | 'OPEN' | 'RESOLVED';

/** V1 evidence-gap check: open from the check view until R2/V2 supplies the basis. */
export function commercialDemoGapStatus(stage: CommercialDemoStage): CommercialDemoGapStatus {
  const index = commercialDemoStageIndex(stage);
  if (index < 1) return 'NOT_VIEWED';
  return index >= commercialDemoStageIndex('R2_REPORTED') ? 'RESOLVED' : 'OPEN';
}

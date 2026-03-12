export const BILL_RESERVE_OPTIONS = [
  { code: '0', coveragePct: 0, label: '0%' },
  { code: '50', coveragePct: 50, label: '50%' },
  { code: '75', coveragePct: 75, label: '75%' },
  { code: '100', coveragePct: 100, label: '100%' },
] as const;

export const SPEND_MODE_OPTIONS = [
  { code: 'enjoy', rate: 1.0, label: 'Enjoy' },
  { code: 'normal', rate: 0.85, label: 'Normal' },
  { code: 'save', rate: 0.7, label: 'Save' },
] as const;
export const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

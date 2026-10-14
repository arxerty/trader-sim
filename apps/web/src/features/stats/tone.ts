export type Tone = 'up' | 'down' | null;

/** Colour tone for a signed money value. */
export const toneOf = (value: number | null | undefined): Tone =>
  value === null || value === undefined || value === 0 ? null : value > 0 ? 'up' : 'down';

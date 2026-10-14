import { hashSeed } from '@trader-sim/engine';

/**
 * Seed for guest (unranked) sessions. Lives in the web app on purpose: the
 * engine itself never touches the clock or Math.random.
 */
export function createSeed(): number {
  return hashSeed(`${Date.now()}-${Math.random()}`);
}

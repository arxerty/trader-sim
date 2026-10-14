/**
 * One step of geometric Brownian motion:
 *   S(t+dt) = S(t) * exp((mu - sigma^2 / 2) * dt + sigma * sqrt(dt) * Z)
 * `z` is a standard normal variate supplied by the caller (keeps the function pure).
 */
export function gbmStep(price: number, mu: number, sigma: number, z: number, dt = 1): number {
  const exponent = (mu - (sigma * sigma) / 2) * dt + sigma * Math.sqrt(dt) * z;
  return price * Math.exp(exponent);
}

/** Multiplicative jump: +5% for magnitude 0.05 up, ~-5% down (symmetric in log space). */
export function applyJump(price: number, magnitude: number, direction: 1 | -1): number {
  return price * Math.exp(direction * Math.log1p(Math.abs(magnitude)));
}

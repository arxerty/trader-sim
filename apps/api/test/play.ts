import {
  applyAction,
  createSession,
  pricesOf,
  stepSession,
  summarizeAccount,
  type GameAction,
  type SessionState,
} from '@trader-sim/engine';
import type { RunConfigDto } from '@trader-sim/shared';

/** Plays a run exactly like the web client: same engine, server-issued seed, logged actions. */
export function playHonestly(config: RunConfigDto, ticks = 200, style = 0) {
  let state: SessionState = createSession(config);
  const log: GameAction[] = [];
  const act = (action: GameAction) => {
    const res = applyAction(state, action);
    if (res.result.ok) {
      state = res.state;
      log.push(action);
    }
  };
  for (let i = 0; i < ticks && !state.bankrupt; i++) {
    const tick = state.market.tick;
    if (i % 25 === 2) {
      act({
        tick,
        type: 'placeOrder',
        payload: {
          assetId: ['NOVA', 'BTCX', 'AURM', 'VOLT'][(i + style) % 4]!,
          side: (i + style) % 2 ? 'short' : 'long',
          type: 'market',
          margin: 1000 + style * 300,
          leverage: style % 2 ? 5 : 2,
        },
      });
    }
    if (i % 25 === 20) {
      const open = state.account.positions[0];
      if (open) act({ tick, type: 'closePosition', payload: { positionId: open.id } });
    }
    state = stepSession(state).state;
  }
  const equity = summarizeAccount(state.account, pricesOf(state.market)).equity;
  return { log, finalTick: state.market.tick, finalEquity: Math.max(0, equity), state };
}

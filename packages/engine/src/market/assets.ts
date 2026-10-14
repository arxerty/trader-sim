import type { AssetDefinition, AssetId } from '../types';

/**
 * Fictional instruments. To add a new asset append an entry here and add
 * `assets.<id>.name` to every locale file (see README).
 */
export const ASSETS: readonly AssetDefinition[] = [
  {
    id: 'NOVA',
    symbol: 'NOVA',
    category: 'tech',
    initialPrice: 182.4,
    volatility: 0.004,
    drift: 0.00002,
    jumpProbability: 0.002,
    jumpScale: 0.05,
    decimals: 2,
  },
  {
    id: 'PTRX',
    symbol: 'PTRX',
    category: 'energy',
    initialPrice: 74.8,
    volatility: 0.0045,
    drift: 0,
    jumpProbability: 0.003,
    jumpScale: 0.06,
    decimals: 2,
  },
  {
    id: 'AURM',
    symbol: 'AURM',
    category: 'metal',
    initialPrice: 1948,
    volatility: 0.0016,
    drift: 0.00001,
    jumpProbability: 0.001,
    jumpScale: 0.02,
    decimals: 2,
  },
  {
    id: 'BTCX',
    symbol: 'BTCX',
    category: 'crypto',
    initialPrice: 41250,
    volatility: 0.008,
    drift: 0.00003,
    jumpProbability: 0.004,
    jumpScale: 0.09,
    decimals: 0,
  },
  {
    id: 'GX500',
    symbol: 'GX500',
    category: 'index',
    initialPrice: 4520,
    volatility: 0.0012,
    drift: 0.00002,
    jumpProbability: 0.001,
    jumpScale: 0.025,
    decimals: 1,
  },
  {
    id: 'VOLT',
    symbol: 'VOLT',
    category: 'auto',
    initialPrice: 238.5,
    volatility: 0.006,
    drift: 0,
    jumpProbability: 0.003,
    jumpScale: 0.07,
    decimals: 2,
  },
  {
    id: 'MEDI',
    symbol: 'MEDI',
    category: 'pharma',
    initialPrice: 95.2,
    volatility: 0.0035,
    drift: 0.00001,
    jumpProbability: 0.004,
    jumpScale: 0.1,
    decimals: 2,
  },
  {
    id: 'AGRO',
    symbol: 'AGRO',
    category: 'agri',
    initialPrice: 6.52,
    volatility: 0.004,
    drift: 0,
    jumpProbability: 0.002,
    jumpScale: 0.05,
    decimals: 3,
  },
];

const BY_ID: ReadonlyMap<AssetId, AssetDefinition> = new Map(ASSETS.map((a) => [a.id, a]));

export function getAsset(id: AssetId): AssetDefinition | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_ASSET_ID: AssetId = 'NOVA';

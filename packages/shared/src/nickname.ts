import { NICKNAME_MAX, NICKNAME_MIN } from './constants';

export const NICKNAME_PATTERN = new RegExp(`^[A-Za-z0-9_]{${NICKNAME_MIN},${NICKNAME_MAX}}$`);

/** Substrings that are never allowed in a nickname (checked after leetspeak normalisation). */
const FORBIDDEN = [
  'admin',
  'moderator',
  'support',
  'official',
  'root',
  'fuck',
  'shit',
  'nazi',
  'hitler',
  'whore',
  'bitch',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

function normalize(nickname: string): string {
  return nickname
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/_/g, '');
}

export type NicknameProblem = 'NICKNAME_INVALID' | 'NICKNAME_FORBIDDEN';

export function checkNickname(nickname: string): NicknameProblem | null {
  if (!NICKNAME_PATTERN.test(nickname)) return 'NICKNAME_INVALID';
  const n = normalize(nickname);
  return FORBIDDEN.some((word) => n.includes(word)) ? 'NICKNAME_FORBIDDEN' : null;
}

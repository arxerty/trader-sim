import { z } from 'zod';
import { nicknameSchema } from './auth';

export const friendRequestBodySchema = z.object({ nickname: nicknameSchema });
export const idParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const friendSchema = z.object({
  nickname: z.string(),
  avatar: z.string().nullable(),
  level: z.string(),
  since: z.string(),
});
export type Friend = z.infer<typeof friendSchema>;

export const friendRequestSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  direction: z.enum(['incoming', 'outgoing']),
  createdAt: z.string(),
});
export type FriendRequest = z.infer<typeof friendRequestSchema>;

export const friendsResponseSchema = z.object({ friends: z.array(friendSchema) });
export const friendRequestsResponseSchema = z.object({ requests: z.array(friendRequestSchema) });

export const dailyChallengeSchema = z.object({
  date: z.string(),
  /** Seconds until the next challenge starts. */
  resetsIn: z.number().int(),
  played: z.boolean(),
  activeRunId: z.string().nullable(),
  result: z
    .object({
      runId: z.string(),
      finalEquity: z.number(),
      roi: z.number(),
      rank: z.number().int().nullable(),
    })
    .nullable(),
  participants: z.number().int(),
});
export type DailyChallenge = z.infer<typeof dailyChallengeSchema>;

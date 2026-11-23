import { z } from 'zod';

export const regionSchema = z.enum(['global', 'china']);
export type Region = z.infer<typeof regionSchema>;

export const tokenSetSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  clientId: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type TokenSet = z.infer<typeof tokenSetSchema>;

export type GarminAccount = {
  id: string;
  region: Region;
  tokens: TokenSet;
};

export type GarminSubject = {
  subject: string;
  region: Region;
  tokens: TokenSet;
};

export type LoginChallengeState = Record<string, unknown>;

export type AuthWorkerResult =
  | { status: 'success'; subject: string; tokens: TokenSet }
  | { status: 'mfa'; method: string; state: LoginChallengeState }
  | { status: 'error'; code: string; message: string; retryable?: boolean };

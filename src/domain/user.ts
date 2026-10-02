export type User = { id: string; createdAt: string };
export type UserIdentity = { userId: string; provider: string; subject: string; createdAt: string };
export type UserProviderAccount = { userId: string; provider: string; providerUserId: string; createdAt: string };
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

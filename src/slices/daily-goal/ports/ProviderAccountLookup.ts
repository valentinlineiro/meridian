export interface ProviderAccountLookup {
  resolveProviderUserId(email: string): Promise<string | null>;
}

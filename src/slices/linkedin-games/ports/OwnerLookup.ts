export interface OwnerLookup {
  resolveOwnerId(email: string): Promise<string | null>;
}

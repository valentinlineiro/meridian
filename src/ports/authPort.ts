export interface SessionClaims {
  sub: string; // owner email
  exp: number; // epoch seconds
}

export interface PasswordVerifier {
  verify(password: string, stored: string): Promise<boolean>;
}

export interface SessionCodec {
  sign(claims: SessionClaims): Promise<string>;
  verify(token: string): Promise<SessionClaims | null>;
}

export interface LoginThrottle {
  // Atomically reserves one attempt. false = locked (nothing is recorded). A reserved attempt counts as a failure
  // until reset() is called, so concurrent guesses cannot all slip past a check-then-act gap.
  tryAcquire(nowMs: number): Promise<boolean>;
  reset(): Promise<void>;
}

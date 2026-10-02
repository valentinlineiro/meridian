import type { LoginThrottle, PasswordVerifier, SessionCodec } from "../ports/authPort.ts";
import { InvalidCredentialsError, TooManyAttemptsError } from "./errors.ts";

export interface LoginPorts {
  passwords: PasswordVerifier;
  sessions: SessionCodec;
  throttle: LoginThrottle;
}

export interface LoginInput {
  email: string;
  password: string;
  adminEmail: string;
  passwordHash: string;
  nowMs: number;
  ttlSeconds: number;
}

// Single-owner login. The password is always verified (even for a wrong email) so response time does not
// reveal which part was wrong. Attempts are reserved atomically (before verifying) and throttled globally: there is exactly one account to protect.
export async function loginUseCase(ports: LoginPorts, i: LoginInput): Promise<string> {
  if (!(await ports.throttle.tryAcquire(i.nowMs))) throw new TooManyAttemptsError();

  const passwordOk = await ports.passwords.verify(i.password, i.passwordHash);
  const emailOk = i.email.trim().toLowerCase() === i.adminEmail.toLowerCase();
  if (!passwordOk || !emailOk) throw new InvalidCredentialsError(); // the reserved attempt stays recorded

  await ports.throttle.reset();
  return ports.sessions.sign({ sub: i.adminEmail, exp: Math.floor(i.nowMs / 1000) + i.ttlSeconds });
}

// Returns the owner email for a valid, unexpired session of the configured owner; otherwise null.
export async function authenticateSession(
  codec: SessionCodec,
  token: string | undefined,
  adminEmail: string,
  nowMs: number,
): Promise<string | null> {
  if (!token) return null;
  const claims = await codec.verify(token);
  if (!claims || claims.exp <= nowMs / 1000) return null;
  return claims.sub.toLowerCase() === adminEmail.toLowerCase() ? adminEmail : null;
}

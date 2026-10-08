// Usage (password never touches argv or shell history):
//   read -rs P && printf %s "$P" | node scripts/hash-password.mjs | npx wrangler secret put ADMIN_PASSWORD_HASH
// Needs Node >= 22.18 (runs the TypeScript hashing module directly).
import { hashPassword } from "../src/infrastructure/auth/pbkdf2PasswordVerifier.ts";

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (input.length < 12) {
  console.error("password must be at least 12 characters (use a long random one)");
  process.exit(1);
}
// PBKDF2 at 100k iterations costs ~10 ms of CPU, the whole Workers Free per-request budget, so the default here is 20000
// (~2.5 ms). Use a long random password (iterations only matter against an offline attack on a leaked hash).
// On a paid plan: ITERATIONS=100000 (the maximum Workers accept).
process.stdout.write(await hashPassword(input, Number(process.env.ITERATIONS) || 20000));

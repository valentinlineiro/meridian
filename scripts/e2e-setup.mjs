import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// 1. Ensure .dev.vars exists for local dev and CI
if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    [
      "SESSION_SECRET='3kKQXN35ZiAxHkY2MM6uihJ0tB7y812l1K1moNWDaxTiSO1y'",
      "ADMIN_EMAIL='owner@localhost'",
      "ADMIN_PASSWORD_HASH='pbkdf2-sha256$20000$uq6qhPQCQihEEE9siWahXw$zM6_LJVL9tdPjT5rMmsYtLdzWOoHMHVqgz1bIx14g0o'",
      "IMPORT_TOKEN='dev-token'",
    ].join("\n") + "\n"
  );
  console.log("created .dev.vars with test credentials");
}

// 2. Ensure local D1 migrations are applied
execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "meridian", "--local"], { stdio: "inherit" });

// 3. Ensure test user and identity exist
const sql = [
  "INSERT OR IGNORE INTO users (id, created_at) VALUES ('demo-owner', datetime('now'))",
  "INSERT OR IGNORE INTO user_identities (user_id, provider, subject, created_at) VALUES ('demo-owner', 'cloudflare_access', 'owner@localhost', datetime('now'))",
].join("; ");
execFileSync("npx", ["wrangler", "d1", "execute", "meridian", "--local", "--command", sql], { stdio: "inherit" });
console.log("e2e environment setup complete");

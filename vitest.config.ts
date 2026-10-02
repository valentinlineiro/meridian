import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .worktrees/ holds linked checkouts with their own test copies; never run them from here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
});

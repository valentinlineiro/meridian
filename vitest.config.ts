import { defineConfig } from "vitest/config";
import { clientAssetsAsText } from "./tests/setup/clientAssetsAsText.ts";

export default defineConfig({
  plugins: [clientAssetsAsText()],
  test: {
    setupFiles: ["./tests/setup/scriptErrors.ts"],
    // .worktrees/ holds linked checkouts with their own test copies; never run them from here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
});

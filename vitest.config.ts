import { defineConfig } from "vitest/config";

// Mirrors the wrangler "Text" rule: *.client.js is the page's inline script, imported as a string.
const clientJsAsText = {
  name: "client-js-as-text",
  enforce: "pre" as const,
  transform: (code: string, id: string) => (id.endsWith(".client.js") ? `export default ${JSON.stringify(code)};` : null),
};

export default defineConfig({
  plugins: [clientJsAsText],
  test: {
    // .worktrees/ holds linked checkouts with their own test copies; never run them from here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
});

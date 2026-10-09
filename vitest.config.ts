import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the wrangler "Text" rule: *.client.js / *.client.css are the page's inline script and styles, imported as strings.
// Vitest blanks any module whose id looks like a .css file, so the import is redirected to "<file>.text" and read here.
const SUFFIX = ".text";
const absolute = (path: string) => (path.startsWith(process.cwd()) ? path : resolve(process.cwd(), "." + path)); // vite may hand over root-relative ids
const clientAssetsAsText = {
  name: "client-assets-as-text",
  enforce: "pre" as const,
  resolveId: (source: string, importer?: string) =>
    importer && /\.client\.(js|css)$/.test(source) ? resolve(dirname(absolute(importer)), source) + SUFFIX : null,
  load: (id: string) =>
    /\.client\.(js|css)\.text$/.test(id) ? `export default ${JSON.stringify(readFileSync(absolute(id.slice(0, -SUFFIX.length)), "utf8"))};` : null,
};

export default defineConfig({
  plugins: [clientAssetsAsText],
  test: {
    setupFiles: ["./tests/setup/scriptErrors.ts"],
    // .worktrees/ holds linked checkouts with their own test copies; never run them from here.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
});

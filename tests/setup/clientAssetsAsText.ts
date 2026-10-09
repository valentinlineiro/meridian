import { existsSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";

// Mirrors the wrangler "Text" rule: *.client.js / *.client.css are the page's inline script and styles, imported as strings.
// Vitest blanks any module whose id looks like a .css file, so the import is redirected to "<file>.text" and read here.
const SUFFIX = ".text";
const ASSET = /\.client\.(js|css)$/;

interface Options {
  root?: string;
  path?: typeof nodePath; // injectable so the Windows and POSIX flavours can both be tested on any OS
  exists?: (file: string) => boolean;
  read?: (file: string) => string;
}

export function clientAssetsAsText({ root = process.cwd(), path = nodePath, exists = existsSync, read = (f) => readFileSync(f, "utf8") }: Options = {}) {
  // Vite hands over either an absolute file path ("C:/repo/src/x.ts", "/repo/src/x.ts") or one relative to the project root
  // ("/src/x.ts"): take whichever exists, without comparing path prefixes (separators differ between platforms).
  const locate = (id: string) => [id, path.join(root, id)].find((candidate) => exists(candidate)) ?? id;
  return {
    name: "client-assets-as-text",
    enforce: "pre" as const,
    resolveId: (source: string, importer?: string) =>
      importer && ASSET.test(source) ? path.join(path.dirname(locate(importer)), source) + SUFFIX : null,
    load: (id: string) => {
      const file = id.endsWith(SUFFIX) ? id.slice(0, -SUFFIX.length) : "";
      return ASSET.test(file) ? `export default ${JSON.stringify(read(locate(file)))};` : null;
    },
  };
}

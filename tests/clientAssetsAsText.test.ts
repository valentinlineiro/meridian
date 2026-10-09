import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";
import { clientAssetsAsText } from "./setup/clientAssetsAsText.ts";

// The Vitest plugin that loads *.client.js / *.client.css as text must find the file whichever way Vite names it.
const plugin = (flavour: typeof nodePath, root: string, files: Record<string, string>) => {
  const key = (f: string) => f.replaceAll("\\", "/");
  const known = new Map(Object.entries(files).map(([f, text]) => [key(f), text]));
  return clientAssetsAsText({ root, path: flavour, exists: (f) => known.has(key(f)), read: (f) => known.get(key(f)) ?? "MISSING" });
};
const load = (p: ReturnType<typeof plugin>, id: string) => p.load(id);

describe.each([
  ["POSIX", nodePath.posix, "/repo", ["/repo/src/frontend.ts", "/src/frontend.ts"], ["/repo/src/dashboard.client.css", "/src/dashboard.client.css"]],
  ["Windows", nodePath.win32, "C:\\repo", ["C:/repo/src/frontend.ts", "C:\\repo\\src\\frontend.ts", "/src/frontend.ts"], ["C:/repo/src/dashboard.client.css", "C:\\repo\\src\\dashboard.client.css", "/src/dashboard.client.css"]],
] as const)("client assets as text on %s paths", (_name, flavour, root, importers, ids) => {
  const p = plugin(flavour, root, {
    [`${root}/src/frontend.ts`]: "", [`${root}/src/dashboard.client.css`]: "body{margin:0}", [`${root}/src/dashboard.client.js`]: "const q=1;",
  });

  it.each(importers)("shouldResolveASiblingStylesheetFromTheImporter_%s", (importer) => {
    const resolved = p.resolveId("./dashboard.client.css", importer)!;
    expect(resolved.replaceAll("\\", "/")).toMatch(/\/repo\/src\/dashboard\.client\.css\.text$/);
  });

  it.each(ids)("shouldReadTheFileWhetherItsIdIsAbsoluteOrRelativeToTheRoot_%s", (file) => {
    expect(load(p, file + ".text")).toBe('export default "body{margin:0}";');
  });

  it("shouldLoadScriptsAsTextToo", () => {
    expect(load(p, `${root}/src/dashboard.client.js.text`)).toBe('export default "const q=1;";');
  });

  it("shouldLeaveOtherModulesAlone", () => {
    expect(p.resolveId("./other.ts", importers[0])).toBeNull();
    expect(p.resolveId("./dashboard.client.css", undefined)).toBeNull();
    expect(load(p, `${root}/src/frontend.ts`)).toBeNull();
  });
});

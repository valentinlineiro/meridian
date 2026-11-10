import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(`${import.meta.dirname}/../web/${p}`);
const manifest = JSON.parse(read("public/manifest.webmanifest").toString());

describe("PWA manifest", () => {
  it("shouldBeInstallableWhenStandaloneWithStartUrlAndIcons", () => {
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/overview", scope: "/", lang: "es" });
    for (const size of [192, 512]) expect(manifest.icons.some((i: { sizes: string; purpose: string }) => i.sizes === `${size}x${size}` && i.purpose === "any")).toBe(true);
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  it("shouldDeclareIconFilesWithTheirRealSize", () => {
    for (const i of manifest.icons as { src: string; sizes: string }[]) {
      const png = read(`public${i.src}`) as Buffer;
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(i.sizes); // IHDR width x height
    }
  });

  it("shouldLinkManifestWithCredentialsBecauseTheSiteIsPrivate", () => {
    const html = read("src/index.html").toString("utf8");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"');
    expect(html).toContain("viewport-fit=cover");
  });

  it("shouldPaintTheBrowserChromeWithTheBackgroundToken", () => {
    const bg = read("src/styles.css").toString("utf8").match(/--bg:(#[0-9a-f]{6})/i)![1];
    expect(read("src/index.html").toString("utf8")).toContain(`name="theme-color" content="${bg}"`);
    expect(manifest).toMatchObject({ theme_color: bg, background_color: bg });
  });
});

// The worker file run against a fake scope: what it must never keep is the point of the tests.
function worker() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: string | { url: string }) => (typeof r === "string" ? r : new URL(r.url).pathname);
  const caches = {
    open: async (n: string) => {
      const m = stores.get(n) ?? stores.set(n, new Map()).get(n)!;
      return { put: async (k: string | { url: string }, r: Response) => void m.set(key(k), r), match: async (k: string | { url: string }) => m.get(key(k))?.clone() };
    },
    delete: async (n: string) => stores.delete(n),
  };
  let handler!: (e: unknown) => void;
  const self = { location: { origin: "https://m.example" }, addEventListener: (t: string, h: (e: unknown) => void) => t === "fetch" && (handler = h), skipWaiting() {}, clients: { claim() {} } };
  let net: (r: unknown) => Promise<unknown> = async () => { throw new Error("offline"); };
  new Function("self", "caches", "fetch", "Response", "URL", readFileSync(`${import.meta.dirname}/../web/public/sw.js`, "utf8"))(self, caches, (r: unknown) => net(r), Response, URL);
  const send = async (path: string, mode = "cors", method = "GET") => {
    let answer: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handler({ request: { method, mode, url: "https://m.example" + path }, respondWith: (p: Promise<Response>) => (answer = p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    const res = answer && (await answer.catch(() => null));
    await Promise.all(pending);
    return { handled: !!answer, res, text: res && "text" in res ? await res.text() : null };
  };
  return { send, setNet: (f: typeof net) => (net = f), stores };
}
const page = (build: string) => `<script src="main-${build}.js"></script>`;
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html" } });

describe("service worker", () => {
  it.each([["/api/stats/summary", "cors"], ["/api/stats/bundle", "navigate"], ["/login", "navigate"]])(
    "shouldNotTouchPrivateOrLoginRequests %s", async (path, mode) => {
      const w = worker();
      w.setNet(async () => html("x"));
      expect((await w.send(path, mode)).handled).toBe(false);
    });

  it("shouldNotTouchWrites", async () => {
    expect((await worker().send("/logout", "navigate", "POST")).handled).toBe(false);
  });

  it("shouldServeLastShellWhenOffline", async () => {
    const w = worker();
    w.setNet(async () => html(page("MNB5ZBY2")));
    await w.send("/chess", "navigate");
    w.setNet(async () => { throw new Error("offline"); });
    expect((await w.send("/games", "navigate")).text).toBe(page("MNB5ZBY2"));
  });

  it("shouldNotStoreARedirectedNavigationBecauseItIsTheLoginPage", async () => {
    const w = worker();
    w.setNet(async () => ({ ok: true, redirected: true, clone() { return this; } }));
    await w.send("/overview", "navigate");
    expect(w.stores.size).toBe(0);
  });

  it("shouldKeepHashedBundleFilesForOfflineAndNothingElse", async () => {
    const w = worker();
    w.setNet(async () => new Response("js"));
    await w.send("/main-MNB5ZBY2.js");
    expect((await w.send("/icons/icon-192.png")).handled).toBe(false);
    w.setNet(async () => { throw new Error("offline"); });
    expect((await w.send("/main-MNB5ZBY2.js")).text).toBe("js");
  });

  it("shouldDropThePreviousBuildWhenANewIndexArrives", async () => {
    const w = worker();
    w.setNet(async () => html(page("MNB5ZBY2")));
    await w.send("/", "navigate");
    w.setNet(async () => new Response("old"));
    await w.send("/chunk-Bbd6LZuW.js");
    w.setNet(async () => html(page("Kd-9xQ_a")));
    await w.send("/", "navigate");
    w.setNet(async () => { throw new Error("offline"); });
    expect((await w.send("/chunk-Bbd6LZuW.js")).res).toBeNull(); // gone from cache, and the network is down
  });
});

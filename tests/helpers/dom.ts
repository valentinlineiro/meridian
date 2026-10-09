import vm from "node:vm";
import { expect } from "vitest";
import { DASHBOARD_HTML } from "../../src/frontend.ts";

export interface MockElement {
  id: string;
  tagName: string;
  textContent: string;
  innerHTML: string;
  style: Record<string, string>;
  value: string;
  className: string;
  hidden?: boolean; // set by the page for panels it hides
  classList: {
    add(...tokens: string[]): void;
    remove(...tokens: string[]): void;
    toggle(token: string, force?: boolean): boolean;
    contains(token: string): boolean;
  };
  children: MockElement[];
  parentElement: MockElement | null;
  attributes: Record<string, string>;
  appendChild(child: MockElement): MockElement;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

export function createMockElement(id = "", tagName = "div"): MockElement {
  const classes = new Set<string>();
  const classList = {
    add: (...tokens: string[]) => tokens.forEach((t) => classes.add(t)),
    remove: (...tokens: string[]) => tokens.forEach((t) => classes.delete(t)),
    toggle: (token: string, force?: boolean) => {
      const shouldHave = force !== undefined ? force : !classes.has(token);
      if (shouldHave) classes.add(token);
      else classes.delete(token);
      return shouldHave;
    },
    contains: (token: string) => classes.has(token),
  };

  let rawText = "";
  let rawHtml = "";

  return {
    id,
    tagName: tagName.toUpperCase(),
    get textContent() {
      if (rawText) return rawText;
      if (rawHtml) return rawHtml.replace(/<[^>]*>/g, "");
      return "";
    },
    set textContent(v: string) {
      rawText = v;
      rawHtml = "";
    },
    get innerHTML() {
      return rawHtml;
    },
    set innerHTML(v: string) {
      rawHtml = v;
      rawText = "";
    },
    style: {},
    value: "",
    className: "",
    classList,
    children: [],
    parentElement: null,
    attributes: {},
    appendChild(child: MockElement) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
  };
}

export function getElementHtmlById(html: string, id: string): string {
  const idAttr = `id="${id}"`;
  const startIdx = html.indexOf(idAttr);
  if (startIdx === -1) return "";
  const tagStart = html.lastIndexOf("<", startIdx);
  if (tagStart === -1) return "";
  const tagMatch = html.slice(tagStart).match(/^<([a-zA-Z0-9]+)/);
  if (!tagMatch) return "";
  const tagName = tagMatch[1];

  let depth = 0;
  const tagRegex = new RegExp(`</?${tagName}\\b[^>]*>`, "gi");
  tagRegex.lastIndex = tagStart;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        return html.slice(tagStart, tagRegex.lastIndex);
      }
    } else if (!match[0].endsWith("/>")) {
      depth++;
    }
  }
  return "";
}

// What the API answers for an account with no data yet, so a page booted by a test starts without errors of its own.
export function emptyAccountPayload(url: string): unknown {
  if (url.startsWith("/api/stats/lang")) return { ok: false, error: "no lang snapshot" };
  if (url.startsWith("/api/stats/summary")) return { games: 0, wins: 0, losses: 0, draws: 0 };
  if (url.startsWith("/api/stats/color")) return { groups: [], difference: null };
  if (url.startsWith("/api/stats/opponents")) return { segments: [], macro: [] };
  if (url.startsWith("/api/stats/opponent-elo")) return { count: 0, buckets: [], min: null, max: null, average: null };
  if (url.startsWith("/api/stats/timeline")) return { snapshots: [] };
  return {};
}

// A test's fetch stub answers only the endpoints it is about; every other request gets the empty-account answer, as the
// page's own boot still asks for them and a stub answering them all with the same payload makes it render garbage.
export function fetchOnly(prefixes: string | string[], handler: (url: string, init?: any) => Promise<unknown>) {
  const mine = ([] as string[]).concat(prefixes);
  return async (url: string, init?: any) =>
    mine.some((p) => url.startsWith(p)) ? handler(url, init) : { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
}

// Every runtime remembers the test that created it. Its console.error lines are reported to that test when it ends
// (settleScriptErrors) and, if the page logs one later still, to whichever file-level check runs next, still naming the owner
// (lateScriptErrors). Nothing is attributed to a test that did not create the runtime, and nothing is lost.
const MODULE_SETUP = "(module setup)";
interface Tracked { owner: string; errors: string[]; reported: number }
const tracked: Tracked[] = [];

export const currentTestOwner = (): string => expect.getState().currentTestName ?? MODULE_SETUP;

export function settleScriptErrors(owner: string): string[] {
  return tracked.filter((t) => t.owner === owner).flatMap(unreported);
}

export function lateScriptErrors(): string[] {
  return tracked.flatMap((t) => unreported(t).map((e) => `[${t.owner}] ${e}`));
}

function unreported(t: Tracked): string[] {
  const fresh = t.errors.slice(t.reported);
  t.reported = t.errors.length;
  return fresh;
}

export interface DashboardRuntime {
  sandbox: any;
  getEl: (selector: string) => MockElement;
  elements: Map<string, MockElement>;
  errors: string[];
  fire: (event: string) => void; // runs the page's listeners for a window event such as hashchange or popstate
  renderLanguagesView: (langs: any, analytics: any, xp: any, activeDetail: any) => void;
  selectCourse: (courseId: string, skipHistory?: boolean) => Promise<void>;
  renderOverviewLangCard: (langs: any, activeDetail: any) => void;
}

export function createDashboardRuntime(initialPath = "/languages", html: string = DASHBOARD_HTML, initialFetch?: (url: string, init?: any) => Promise<unknown>): DashboardRuntime {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    throw new Error("Could not find script block in the page");
  }
  const scriptCode = scriptMatch[1] ?? "";

  const elements = new Map<string, MockElement>();

  function getEl(sel: string): MockElement {
    if (!elements.has(sel)) {
      const cleanId = sel.startsWith("#") ? sel.slice(1) : sel;
      elements.set(sel, createMockElement(cleanId));
    }
    return elements.get(sel)!;
  }

  const localStorageStore = new Map<string, string>();
  const errors: string[] = [];
  tracked.push({ owner: currentTestOwner(), errors, reported: 0 });

  const listeners: Record<string, Array<() => void>> = {};
  // history.pushState/replaceState: the address bar follows the URL the page sets (path, query and hash)
  const navigate = (url: string) => {
    if (!url.startsWith("/")) return;
    const u = new URL(url, "https://meridian.local");
    sandbox.location.pathname = u.pathname;
    sandbox.location.search = u.search;
    sandbox.location.hash = u.hash;
  };

  const sandbox: any = {
    document: {
      querySelector: (sel: string) => getEl(sel),
      querySelectorAll: (sel: string) => [],
      getElementById: (id: string) => getEl("#" + id),
      createElement: (tag: string) => createMockElement("", tag),
    },
    location: {
      pathname: initialPath,
      hash: "",
      search: "",
      get href() {
        return "https://meridian.local" + this.pathname + (this.search || "") + (this.hash || "");
      },
    },
    localStorage: {
      getItem: (k: string) => localStorageStore.get(k) ?? null,
      setItem: (k: string, v: string) => localStorageStore.set(k, String(v)),
      removeItem: (k: string) => localStorageStore.delete(k),
      clear: () => localStorageStore.clear(),
    },
    history: {
      pushState: (_state: any, _title: string, url: string) => navigate(url),
      replaceState: (_state: any, _title: string, url: string) => navigate(url),
    },
    window: {
      addEventListener: (ev: string, fn: any) => { (listeners[ev] ??= []).push(fn); },
      removeEventListener: (_ev: string, _fn: any) => {},
    },
    console: { ...console, error: (...a: unknown[]) => { errors.push(a.map((x) => (typeof (x as Error)?.stack === "string" ? `${(x as Error).message} @ ${((x as Error).stack ?? "").split("\n")[1]?.trim() ?? ""}` : String(x))).join(" ")); } },
    setTimeout: (_fn: any) => 0,
    clearTimeout: () => {},
    URLSearchParams,
    URL,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Map,
    Promise,
    encodeURIComponent,
    fetch: async (url: string) => ({ ok: true, status: 200, json: async () => emptyAccountPayload(String(url)) }),
    j: async () => null,
  };
  if (initialFetch) sandbox.fetch = initialFetch; // the page starts loading while the script runs, so a stub set afterwards misses its first requests
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.location = sandbox.location;
  sandbox.window.history = sandbox.history;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  return {
    sandbox,
    getEl,
    elements,
    errors,
    fire: (ev: string) => (listeners[ev] ?? []).forEach((fn) => fn()),
    renderLanguagesView: sandbox.renderLanguagesView,
    selectCourse: sandbox.selectCourse,
    renderOverviewLangCard: sandbox.renderOverviewLangCard,
  };
}

// The browser's own router, evaluated in the dashboard script's context (not a copy of it).
export function parseCanonicalRoute(...args: Array<string | null | undefined>) {
  const rt = createDashboardRuntime("/overview");
  return JSON.parse(vm.runInContext(`JSON.stringify(parseCanonicalRoute(${args.map((a) => JSON.stringify(a)).join(",")}))`, rt.sandbox));
}

// Calls a function of the dashboard script as the browser would (a fresh page each time) and returns its result plus every
// element the script touched, keyed by selector. Replaces slicing function bodies out of the source.
export function callDashboard(expression: string): { result: any; els: Record<string, MockElement> } {
  const rt = createDashboardRuntime("/overview");
  const result = vm.runInContext(expression, rt.sandbox);
  return { result, els: Object.fromEntries(rt.elements) };
}

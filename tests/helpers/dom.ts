import vm from "node:vm";
import { DASHBOARD_HTML } from "../../src/frontend.ts";

export interface MockElement {
  id: string;
  tagName: string;
  textContent: string;
  innerHTML: string;
  style: Record<string, string>;
  value: string;
  className: string;
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

export interface DashboardRuntime {
  sandbox: any;
  getEl: (selector: string) => MockElement;
  elements: Map<string, MockElement>;
  renderLanguagesView: (langs: any, analytics: any, xp: any, activeDetail: any) => void;
  selectCourse: (courseId: string, skipHistory?: boolean) => Promise<void>;
  renderOverviewLangCard: (langs: any, activeDetail: any) => void;
}

export function createDashboardRuntime(initialPath = "/languages", html: string = DASHBOARD_HTML): DashboardRuntime {
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
      pushState: (_state: any, _title: string, url: string) => {
        if (url.startsWith("/")) {
          const pathOnly = (url.split("?")[0] ?? "").split("#")[0] ?? "";
          sandbox.location.pathname = pathOnly;
        }
      },
      replaceState: (_state: any, _title: string, url: string) => {
        if (url.startsWith("/")) {
          const pathOnly = (url.split("?")[0] ?? "").split("#")[0] ?? "";
          sandbox.location.pathname = pathOnly;
        }
      },
    },
    window: {
      addEventListener: (_ev: string, _fn: any) => {},
      removeEventListener: (_ev: string, _fn: any) => {},
    },
    console,
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
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    j: async () => null,
  };
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
    renderLanguagesView: sandbox.renderLanguagesView,
    selectCourse: sandbox.selectCourse,
    renderOverviewLangCard: sandbox.renderOverviewLangCard,
  };
}

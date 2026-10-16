/**
 * Shared DOM locator helpers for Chrome extension content scripts
 * and Project OS in-app browser injection.
 */

export interface LocatorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocatorSnapshot {
  url: string;
  routePath: string;
  selector?: string;
  axName?: string;
  textHint?: string;
  visualHash?: string;
  bounds?: LocatorRect;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

export function buildStableSelector(el: Element): string | undefined {
  if (!(el instanceof Element)) return undefined;
  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test");
  if (testId) return `[data-testid="${cssEscape(testId)}"]`;

  if (el.id && /^[A-Za-z][\w:-]*$/.test(el.id)) {
    return `#${cssEscape(el.id)}`;
  }

  const aria = el.getAttribute("aria-label");
  if (aria) {
    const tag = el.tagName.toLowerCase();
    return `${tag}[aria-label="${cssEscape(aria)}"]`;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && current.nodeType === 1 && depth < 5) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
    depth += 1;
    if (current && (current.id || current === document.body)) break;
  }
  if (current?.id && /^[A-Za-z][\w:-]*$/.test(current.id)) {
    parts.unshift(`#${cssEscape(current.id)}`);
  }
  return parts.join(" > ") || undefined;
}

export function textHintForElement(el: Element): string | undefined {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, 120);
}

export function axNameForElement(el: Element): string | undefined {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.getAttribute("alt") ||
    undefined
  );
}

export function boundsForElement(el: Element): LocatorRect | undefined {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function elementFromPoint(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

export function queryBySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function captureLocatorAtPoint(
  clientX: number,
  clientY: number,
): LocatorSnapshot {
  const url = location.href;
  const routePath = location.pathname || "/";
  const el = elementFromPoint(clientX, clientY);
  if (!el) {
    return { url, routePath };
  }
  return {
    url,
    routePath,
    selector: buildStableSelector(el),
    axName: axNameForElement(el),
    textHint: textHintForElement(el),
    bounds: boundsForElement(el),
  };
}

export function resolveSelectorBounds(
  selector: string,
): LocatorRect | undefined {
  const el = queryBySelector(selector);
  if (!el) return undefined;
  return boundsForElement(el);
}

export function installSpaNavigationHook(onNavigate: () => void): () => void {
  const notify = () => onNavigate();
  const wrap = (type: "pushState" | "replaceState") => {
    const original = history[type];
    history[type] = function patched(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
  };
}

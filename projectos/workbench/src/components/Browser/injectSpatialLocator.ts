/** Guest-world script: reports location hints to the host via console channel prefix. */
export const SPATIAL_LOCATOR_CONSOLE_PREFIX = '__projectos_spatial_pin__:'

export function buildSpatialLocatorInjectionSource(): string {
  return `(() => {
  if (window.__projectosSpatialLocatorInstalled) return;
  window.__projectosSpatialLocatorInstalled = true;

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\\\"');
  }

  function buildStableSelector(el) {
    if (!(el instanceof Element)) return undefined;
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) return '[data-testid="' + cssEscape(testId) + '"]';
    if (el.id && /^[A-Za-z][\\\\w:-]*$/.test(el.id)) return '#' + cssEscape(el.id);
    const aria = el.getAttribute('aria-label');
    if (aria) return el.tagName.toLowerCase() + '[aria-label="' + cssEscape(aria) + '"]';
    const parts = [];
    let current = el;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 5) {
      let part = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(function (child) {
          return child.tagName === current.tagName;
        });
        if (siblings.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }
      parts.unshift(part);
      current = parent;
      depth += 1;
      if (current && (current.id || current === document.body)) break;
    }
    if (current && current.id && /^[A-Za-z][\\\\w:-]*$/.test(current.id)) {
      parts.unshift('#' + cssEscape(current.id));
    }
    return parts.join(' > ') || undefined;
  }

  function publish(point) {
    var url = location.href;
    var routePath = location.pathname || '/';
    var payload = { surface: 'projectos-browser', url: url, routePath: routePath };
    if (point) {
      var el = document.elementFromPoint(point.x, point.y);
      if (el) {
        var rect = el.getBoundingClientRect();
        payload.selector = buildStableSelector(el);
        payload.axName = el.getAttribute('aria-label') || el.getAttribute('title') || undefined;
        payload.textHint = (el.textContent || '').replace(/\\\\s+/g, ' ').trim().slice(0, 120) || undefined;
        if (rect.width > 0 && rect.height > 0) {
          payload.bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        }
      }
    }
    console.log(${JSON.stringify(SPATIAL_LOCATOR_CONSOLE_PREFIX)} + JSON.stringify(payload));
  }

  function wrap(type) {
    var original = history[type];
    history[type] = function () {
      var result = original.apply(this, arguments);
      publish();
      return result;
    };
  }
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', function () { publish(); });
  window.addEventListener('hashchange', function () { publish(); });
  document.addEventListener('pointerdown', function (event) {
    publish({ x: event.clientX, y: event.clientY });
  }, true);
  window.addEventListener('scroll', function () { publish(); }, { passive: true });
  publish();
})();`
}

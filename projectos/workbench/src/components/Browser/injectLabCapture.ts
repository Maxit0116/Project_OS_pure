/** Guest-world capture for Product Lab — reports via console channel prefix only. */
export const LAB_CAPTURE_CONSOLE_PREFIX = '__projectos_lab_capture__:'

export type LabCaptureGuestEvent = {
  kind: 'console_error' | 'unhandled_rejection' | 'network_failure'
  title: string
  detail: string
  url?: string
  status?: number
  method?: string
}

export function buildLabCaptureInjectionSource(): string {
  return `(() => {
  if (window.__projectosLabCaptureInstalled) return;
  window.__projectosLabCaptureInstalled = true;

  function redact(text) {
    return String(text || '')
      .replace(/(authorization|api[_-]?key|token|password|secret)\\s*[:=]\\s*[^\\s&,;]+/gi, '$1=[redacted]')
      .replace(/Bearer\\s+[A-Za-z0-9._\\-]+/gi, 'Bearer [redacted]')
      .slice(0, 1800);
  }

  function publish(payload) {
    try {
      console.log(${JSON.stringify(LAB_CAPTURE_CONSOLE_PREFIX)} + JSON.stringify({
        kind: payload.kind,
        title: String(payload.title || 'Issue').slice(0, 200),
        detail: redact(payload.detail || ''),
        url: payload.url ? String(payload.url).slice(0, 1000) : undefined,
        status: typeof payload.status === 'number' ? payload.status : undefined,
        method: payload.method ? String(payload.method).slice(0, 16) : undefined,
      }));
    } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    var msg = (event && event.message) || 'Script error';
    var stack = event && event.error && event.error.stack ? String(event.error.stack) : '';
    publish({
      kind: 'console_error',
      title: msg.slice(0, 120),
      detail: stack || msg,
      url: location.href,
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var detail = '';
    if (reason && typeof reason === 'object') {
      detail = reason.stack || reason.message || JSON.stringify(reason);
    } else {
      detail = String(reason);
    }
    publish({
      kind: 'unhandled_rejection',
      title: ('Unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason))).slice(0, 120),
      detail: detail,
      url: location.href,
    });
  });

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function () {
      var input = arguments[0];
      var init = arguments[1];
      var method = (init && init.method) || 'GET';
      var reqUrl = typeof input === 'string' ? input : (input && input.url) || '';
      return originalFetch.apply(null, arguments).then(function (response) {
        if (response && response.status >= 400) {
          publish({
            kind: 'network_failure',
            title: ('HTTP ' + response.status + ' ' + method + ' ' + reqUrl).slice(0, 120),
            detail: method + ' ' + reqUrl + ' → ' + response.status,
            url: reqUrl || location.href,
            status: response.status,
            method: method,
          });
        }
        return response;
      }, function (err) {
        publish({
          kind: 'network_failure',
          title: ('Fetch failed ' + method + ' ' + reqUrl).slice(0, 120),
          detail: String(err && err.message ? err.message : err),
          url: reqUrl || location.href,
          method: method,
        });
        throw err;
      });
    };
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__projectosLabMethod = method;
      this.__projectosLabUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      xhr.addEventListener('loadend', function () {
        var status = xhr.status;
        if (status >= 400 || status === 0) {
          publish({
            kind: 'network_failure',
            title: ('XHR ' + status + ' ' + (xhr.__projectosLabMethod || 'GET') + ' ' + (xhr.__projectosLabUrl || '')).slice(0, 120),
            detail: String(xhr.__projectosLabMethod || 'GET') + ' ' + String(xhr.__projectosLabUrl || '') + ' → ' + status,
            url: String(xhr.__projectosLabUrl || location.href),
            status: status,
            method: String(xhr.__projectosLabMethod || 'GET'),
          });
        }
      });
      return send.apply(this, arguments);
    };
  }
})();`
}

export function parseLabCaptureConsoleMessage(
  message: string,
): LabCaptureGuestEvent | null {
  if (!message.startsWith(LAB_CAPTURE_CONSOLE_PREFIX)) return null
  try {
    const parsed = JSON.parse(message.slice(LAB_CAPTURE_CONSOLE_PREFIX.length)) as LabCaptureGuestEvent
    if (
      parsed.kind !== 'console_error' &&
      parsed.kind !== 'unhandled_rejection' &&
      parsed.kind !== 'network_failure'
    ) {
      return null
    }
    if (!parsed.title) return null
    return parsed
  } catch {
    return null
  }
}

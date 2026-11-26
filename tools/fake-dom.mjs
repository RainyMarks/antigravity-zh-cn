// A deliberately tiny DOM stand-in for testing theme/runtime.js and theme/panel.js in Node. It
// implements only what they touch; MutationObserver callbacks run when the test calls flush().
export function createFakeDom({ withRoot = true } = {}) {
  const observers = new Set();

  class FakeElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.attrs = new Map();
      this.children = [];
      this.parentNode = null;
      this.shadowRoot = null;
      this.listeners = {};
      this.textContent = '';
      this.style = { cssText: '', colorScheme: '', setProperty() {} };
      const el = this;
      this.classList = {
        contains: (c) => (el.attrs.get('class') || '').split(/\s+/).includes(c),
        toggle(c, on) {
          const set = new Set((el.attrs.get('class') || '').split(/\s+/).filter(Boolean));
          if (on ?? !set.has(c)) set.add(c);
          else set.delete(c);
          el.setAttribute('class', [...set].join(' '));
        },
        add: (c) => el.classList.toggle(c, true),
        remove: (c) => el.classList.toggle(c, false),
      };
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    /** Test helper: run the listeners registered for `type` on this element. */
    dispatch(type, event = {}) {
      for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...event });
    }
    attachShadow() {
      this.shadowRoot = new FakeElement('#shadow-root');
      this.shadowRoot.host = this;
      return this.shadowRoot;
    }
    focus() {}
    get isConnected() {
      let n = this;
      while (n.parentNode || n.host) n = n.parentNode || n.host;
      return n === document.documentElement;
    }
    /** Test helper: every element below this one, including inside shadow roots. */
    descendants() {
      const out = [];
      const walk = (n) => {
        for (const c of [...(n.shadowRoot ? [n.shadowRoot] : []), ...n.children]) {
          if (c.nodeType !== 1) continue;
          out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    /** Test helper: text content of this element and its descendants. */
    get text() {
      return this.children.map((c) => (c.nodeType === 3 ? c.textContent : c.text)).join('');
    }
    setAttribute(n, v) {
      this.attrs.set(n, String(v));
    }
    getAttribute(n) {
      return this.attrs.has(n) ? this.attrs.get(n) : null;
    }
    hasAttribute(n) {
      return this.attrs.has(n);
    }
    removeAttribute(n) {
      this.attrs.delete(n);
    }
    get id() {
      return this.getAttribute('id') || '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) {
      nodes.forEach((n) => this.appendChild(typeof n === 'string' ? { nodeType: 3, textContent: n } : n));
    }
    remove() {
      if (!this.parentNode) return;
      const list = this.parentNode.children;
      list.splice(list.indexOf(this), 1);
      this.parentNode = null;
    }
    // Supports only "tag#id"; anything else finds nothing.
    querySelector(sel) {
      const m = /^(\w+)#([\w-]+)$/.exec(sel);
      const walk = (n) => {
        for (const c of n.children) {
          if (c.nodeType !== 1) continue;
          if (m && c.tagName === m[1].toUpperCase() && c.id === m[2]) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    }
  }

  const document = {
    documentElement: null,
    head: null,
    body: null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {},
    querySelector: (sel) => document.documentElement && document.documentElement.querySelector(sel),
  };
  const listeners = [];
  const window = {
    console: { warn() {}, error() {} },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ color: 'rgb(22, 27, 25)', backgroundColor: 'rgb(13, 18, 16)', borderTopColor: 'rgb(171, 178, 175)' }),
    // unref: the runtime keeps a periodic timer; it must not keep the test process alive.
    setTimeout: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    },
    clearTimeout: (t) => clearTimeout(t),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener: (type, fn) => listeners.push([type, fn]),
    dispatch(type, event) {
      for (const [t, fn] of listeners) if (t === type) fn(event);
    },
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        observers.add(this);
      }
      disconnect() {
        observers.delete(this);
      }
    },
  };

  /** Create <html>, <head> and <body> like the HTML parser would. */
  function buildTree({ dark = true } = {}) {
    const html = new FakeElement('html');
    const head = new FakeElement('head');
    const body = new FakeElement('body');
    html.append(head, body);
    body.setAttribute('data-agy-theme', '');
    if (dark) body.setAttribute('class', 'dark');
    Object.assign(document, { documentElement: html, head, body });
  }
  if (withRoot) buildTree();

  return {
    document,
    window,
    buildTree,
    /** Run every active MutationObserver callback (records are not inspected by the runtime). */
    flush() {
      for (const o of [...observers]) o.cb([]);
    },
  };
}

/** A fake electron.ipcRenderer backed by a plain object, like app_storage.json. */
export function createFakeIpc(items = {}) {
  const calls = [];
  const handlers = [];
  return {
    items,
    calls,
    sendSync: (ch) => (ch === 'storage:get-items-sync' ? { ...items } : null),
    invoke(ch, arg) {
      calls.push([ch, arg]);
      if (ch === 'storage:update-items') Object.assign(items, arg);
      return Promise.resolve(ch === 'storage:get-items' ? { ...items } : undefined);
    },
    on: (ch, fn) => ch === 'storage:changed' && handlers.push(fn),
    /** Simulate main broadcasting a storage change to this window. */
    emit(changes) {
      Object.assign(items, changes);
      handlers.forEach((fn) => fn({}, changes));
    },
  };
}

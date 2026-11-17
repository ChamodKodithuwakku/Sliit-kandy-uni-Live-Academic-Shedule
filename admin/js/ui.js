// Small DOM toolkit shared by every admin page: elements, icons, toasts,
// dialogs and the tiny bits of formatting the pages repeat.

export const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  exam: '<path d="M8 3h8a2 2 0 0 1 2 2v15a1 1 0 0 1-1.5.9L12 18.5 7.5 20.9A1 1 0 0 1 6 20V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 11.5h4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  media: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10.5 9.5 4.5 2.5-4.5 2.5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 18.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.9H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.6 6.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.6 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 14.4A6.5 6.5 0 0 1 21.5 20"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.9A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.3 4"/><path d="M6.4 7.9A15.8 15.8 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.6-.7"/><path d="M9.9 10.1a3 3 0 0 0 4.1 4.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',
  logout: '<path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10m0 0-3-3m3 3-3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  refresh: '<path d="M3.5 12a8.5 8.5 0 0 1 14.8-5.7L21 9"/><path d="M20.5 12a8.5 8.5 0 0 1-14.8 5.7L3 15"/><path d="M21 4v5h-5M3 20v-5h5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9m-3 0v3m-2-3v2.5"/>'
};

export function icon(name, className = 'icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

// ----------------------------------------------------------------- toasts

function toastStack() {
  let stack = $('.toast-stack');
  if (!stack) document.body.append(stack = el('div', { class: 'toast-stack' }));
  return stack;
}

export function toast(message, kind = 'ok', milliseconds = 3600) {
  const node = el('div', { class: `toast ${kind}`, html: `${icon(kind === 'err' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>` });
  toastStack().append(node);
  setTimeout(() => {
    node.style.transition = 'opacity 200ms ease';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, milliseconds);
}

export function banner(container, message, kind = 'error') {
  if (!container) return;
  container.replaceChildren();
  if (!message) { container.hidden = true; return; }
  container.hidden = false;
  const lines = [].concat(message);
  container.append(el('div', {
    class: `alert alert-${kind}`,
    html: `${icon(kind === 'ok' ? 'check' : 'alert')}<div>${lines.map(line => escapeHtml(line)).join('<br>')}</div>`
  }));
}

// ----------------------------------------------------------------- dialogs

/**
 * Opens a modal. `build(body, close)` fills the body; the returned promise
 * resolves with whatever `close(value)` was called with (undefined = cancelled).
 */
export function modal({ title, note = '', build, confirmLabel = 'Save', confirmClass = 'btn btn-blue', onConfirm, width }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = event => { if (event.key === 'Escape') finish(undefined); };

    const body = el('div', { class: 'modal-body' });
    const confirmButton = el('button', { class: confirmClass, type: 'button', text: confirmLabel });
    const box = el('div', { class: 'modal', style: width ? `max-width:${width}` : null, role: 'dialog', 'aria-modal': 'true' }, [
      el('header', {}, [
        el('div', {}, [el('h2', { text: title }), note ? el('p', { text: note }) : null]),
        el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', text: '×', onClick: () => finish(undefined) })
      ]),
      body,
      el('div', { class: 'modal-foot' }, [
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onClick: () => finish(undefined) }),
        confirmButton
      ])
    ]);
    const backdrop = el('div', { class: 'modal-backdrop', onClick: event => { if (event.target === backdrop) finish(undefined); } }, [box]);

    build?.(body, finish);
    confirmButton.addEventListener('click', async () => {
      if (!onConfirm) return finish(true);
      confirmButton.disabled = true;
      try {
        const result = await onConfirm(body, finish);
        if (result !== false) finish(result === undefined ? true : result);
      } finally { confirmButton.disabled = false; }
    });

    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => body.querySelector('input,select,textarea')?.focus(), 40);
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return modal({
    title,
    build: body => body.append(el('p', { text: message, style: 'margin:0;color:#475569;line-height:1.6' })),
    confirmLabel,
    confirmClass: danger ? 'btn btn-danger' : 'btn btn-blue',
    width: '440px'
  }).then(Boolean);
}

// ----------------------------------------------------------------- inputs

export function field({ label, name, type = 'text', value = '', help = '', options, placeholder = '', required = false, attrs = {} }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let input;
  if (options) {
    input = el('select', { id, name, ...attrs });
    for (const option of options) {
      const [optionValue, optionLabel] = Array.isArray(option) ? option : [option, option];
      input.append(el('option', { value: optionValue, text: optionLabel, selected: String(optionValue) === String(value) }));
    }
  } else if (type === 'textarea') {
    input = el('textarea', { id, name, placeholder, ...attrs });
    input.value = value ?? '';
  } else {
    input = el('input', { id, name, type, placeholder, required, ...attrs });
    input.value = value ?? '';
  }
  const wrap = el('div', { class: 'field' }, [
    el('label', { for: id, text: label }),
    input,
    help ? el('p', { class: 'help', text: help }) : null
  ]);
  return { wrap, input };
}

export function checkbox({ label, name, checked = false, help = '' }) {
  const input = el('input', { type: 'checkbox', name, checked: Boolean(checked) });
  const wrap = el('label', { class: 'checkline' }, [
    input,
    el('span', {}, [label, help ? el('small', { text: help }) : null])
  ]);
  return { wrap, input };
}

/** Reads a form-ish container into a plain object. */
export function readForm(root) {
  const values = {};
  for (const node of $$('input,select,textarea', root)) {
    if (!node.name) continue;
    values[node.name] = node.type === 'checkbox' ? node.checked : node.value.trim();
  }
  return values;
}

export function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

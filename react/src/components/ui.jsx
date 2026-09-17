/* Shared UI primitives — markup/classNames identical to the vanilla build. */

import { useSyncExternalStore } from 'react';

/* ---------------- Toasts ---------------- */
let toasts = [];
const toastListeners = new Set();
const emitToasts = () => toastListeners.forEach((l) => l());
let toastId = 0;

export function toast(msg, type) {
  const t = { id: ++toastId, msg, type };
  toasts = [...toasts, t];
  emitToasts();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); emitToasts(); }, 4200);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => { toastListeners.add(l); return () => toastListeners.delete(l); },
    () => toasts,
  );
  return (
    <div id="toasts">
      {list.map((t) => (
        <div key={t.id} className={'toast' + (t.type ? ' ' + t.type : '')}>{t.msg}</div>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ title, wide, onClose, footer, children }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Small helpers ---------------- */
export const Icon = ({ name, style }) => (
  <span className="material-symbols-outlined" style={style}>{name}</span>
);

export const Pill = ({ color, title, children }) => (
  <span className={'pill ' + color} title={title}>{children}</span>
);

export const Tile = ({ label, value, variant, suffix }) => (
  <div className={'tile' + (variant ? ' ' + variant : '')}>
    <div className="t-label">{label}</div>
    <div className="t-value">
      {value}
      {suffix && <span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}> {suffix}</span>}
    </div>
  </div>
);

/* Form field with inline error (same .field / .error structure) */
export function Field({ label, required, hint, error, full, children, hidden }) {
  return (
    <div className={'field' + (error ? ' invalid' : '') + (full ? ' full' : '')} hidden={hidden || undefined}>
      {label && (
        <label>{label} {required && <span className="req">*</span>}</label>
      )}
      {children}
      {hint && <div className="hint">{hint}</div>}
      <div className="error" style={error ? {} : { display: 'none' }}>{error || ''}</div>
    </div>
  );
}

export function FooterTools({ onReset }) {
  return (
    <div className="footer-tools">
      <button onClick={onReset}>Reset demo data</button>
    </div>
  );
}

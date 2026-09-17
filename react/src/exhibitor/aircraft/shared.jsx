import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { actions } from '../../store/exhibitorStore.js';
import { EVENT, TERMS_PDF_URL, STATIC_RATE_CHART, nowStr, fmtFee } from '../../lib.js';
import { Modal, Pill, toast } from '../../components/ui.jsx';

/* ---------------- page header + step tabs ---------------- */
export function AcftHeader({ active, draftHint }) {
  const tabs = [
    ['/exhibitor/aircraft', 'My Aircraft', true],
    ['/exhibitor/aircraft/add', 'Aircraft Detail (Form 1)'],
    ['/exhibitor/aircraft/air7a', 'Arrival — Air-7A'],
    ['/exhibitor/aircraft/air4', 'Flying Display — Air-4'],
    ['/exhibitor/aircraft/air7b', 'DGCA — AIR 7B & 9'],
  ];
  return (
    <>
      <h1 className="page-title">Aircraft Registration</h1>
      <p className="page-sub">
        Register your aircraft for {EVENT.name}, complete the arrival (Air-7A), flying display (Air-4) and DGCA (AIR 7B &amp; 9) forms,
        then submit for committee approval — payment opens after approval.{' '}
        <a href={TERMS_PDF_URL} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions (PDF)</a>
      </p>
      <div className="filter-chips" style={{ marginBottom: 20 }}>
        {tabs.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={!!end} style={{ textDecoration: 'none' }}
            className={({ isActive }) => 'fchip' + (isActive ? ' on' : '')}>{label}</NavLink>
        ))}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '-10px 0 12px', minHeight: '1em' }}>{draftHint || ''}</div>
    </>
  );
}

/* ---------------- status pills (application vs payment) ---------------- */
export function appStatusPill(a) {
  if (a.status === 'draft') return <Pill color="gray">Draft</Pill>;
  if (a.status === 'submitted') return <Pill color="amber">Pending Approval</Pill>;
  if (a.status === 'approved' || a.status === 'registered') return <Pill color="green">Approved</Pill>;
  if (a.status === 'rejected') return <Pill color="red" title={a.remark || ''}>Rejected</Pill>;
  return <Pill color="gray">{a.status}</Pill>;
}
export function payStatusPill(a) {
  if (a.status === 'registered') return <Pill color="green">Paid</Pill>;
  if (a.status === 'approved') {
    return a.price != null ? <Pill color="amber">Payment Pending</Pill> : <Pill color="gray">No Fee</Pill>;
  }
  return <span style={{ color: 'var(--muted)' }}>—</span>;
}

/* ---------------- step wizard ---------------- */
export function nextStepPath(a) {
  if (!a.air7a) return '/exhibitor/aircraft/air7a?id=' + a.id;
  if (!a.air4) return '/exhibitor/aircraft/air4?id=' + a.id;
  if (!a.air7b) return '/exhibitor/aircraft/air7b?id=' + a.id;
  return '/exhibitor/aircraft';
}
/* After a step saves: continue to the next pending step, or — when all
   4 steps are done — auto-submit for committee approval. */
export async function continueWizard(a, navigate) {
  const path = nextStepPath(a);
  if (path === '/exhibitor/aircraft') {
    const submitted = await actions.submitAircraftIfComplete(a.id);
    if (submitted) {
      toast('All steps completed — application ' + (a.appNo || '') + ' submitted for committee approval. Payment will open after approval.', 'success');
    }
  }
  navigate(path);
}

/* Default aircraft for a form: ?id= param, else the most recent
   application whose THIS form is still pending, else the latest. */
export function resolveSel(list, paramId, formKey) {
  if (paramId && list.some((a) => a.id === paramId)) return paramId;
  const pending = [...list].reverse().find((a) => !a[formKey] && (a.status === 'draft' || a.status === 'rejected'));
  return (pending || list[list.length - 1]).id;
}

/* ---------------- draft auto-save (every step) ---------------- */
export function useDraft(key, drafts, form, setForm) {
  const restoredKey = useRef(null);
  const skipNext = useRef(true);
  const [hint, setHint] = useState('');

  // restore once per key
  useEffect(() => {
    if (restoredKey.current === key) return;
    restoredKey.current = key;
    skipNext.current = true;
    const d = drafts ? drafts[key] : null;
    if (d && d.values) {
      setForm((f) => ({ ...f, ...d.values }));
      setHint('Draft restored (auto-saved ' + d.__at + ')');
    } else {
      setHint('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // debounced save on change
  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    const t = setTimeout(async () => {
      const at = nowStr();
      await actions.saveDraft(key, { values: form, __at: at });
      setHint('Draft auto-saved · ' + at);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  return { hint, clear: () => actions.clearDraft(key) };
}

/* ---------------- uploads (data-URL, admin preview) ---------------- */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export function readUpload(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      toast('"' + file.name + '" is larger than 2 MB — name saved, preview will not be available.', 'error');
      return resolve(null);
    }
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

/* ---------------- rate chart modal ---------------- */
export function RateChartModal({ onClose }) {
  return (
    <Modal wide title="Aircraft Static Display — Rate Chart" onClose={onClose}
      footer={<button className="btn btn-outline" onClick={onClose}>Close</button>}>
      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>Rates per aircraft depending on tonnage.</p>
      <div className="tablewrap"><table className="grid"><tbody>
        <tr><th>Aircraft Weight</th><th>Indian Participants (in INR)</th><th>Foreign Participants (in USD)</th></tr>
        {STATIC_RATE_CHART.map((s) => (
          <tr key={s.label}>
            <td>{s.label}</td>
            <td className="num">{s.inr.toLocaleString('en-IN')}</td>
            <td className="num">{s.usd.toLocaleString('en-US')}</td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="note" style={{ marginBottom: 0 }}>
        <b className="title">Note</b>
        This rate chart applies only to <b>Static Display</b> aircraft. No registration fee is charged for Flying Display aircraft.
      </div>
    </Modal>
  );
}

/* ---------------- invoice (after payment) ---------------- */
export function downloadInvoice(a) {
  if (!a || a.status !== 'registered' || a.price == null) { toast('Invoice is available after payment.', 'error'); return; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const invNo = 'INV-' + (a.appNo || '').replace('ACR-', '');
  const fee = fmtFee(a.price, a.feeCurrency);
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + invNo + '</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#212B36;margin:0;padding:40px;font-size:14px}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2F62D8;padding-bottom:16px}' +
    '.logo{font-size:26px;font-weight:800;color:#2F62D8}h1{font-size:20px;margin:0;text-align:right}' +
    '.muted{color:#6B7686;font-size:12px}.grid{display:flex;justify-content:space-between;margin:24px 0}' +
    'table{width:100%;border-collapse:collapse;margin-top:8px}' +
    'th{background:#F1F4F9;text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}' +
    'td{padding:10px 12px;border-bottom:1px solid #E6EAF2}' +
    '.total td{font-weight:800;font-size:16px;border-top:2px solid #212B36;border-bottom:none}' +
    '.right{text-align:right}.stamp{display:inline-block;margin-top:8px;padding:4px 14px;border:2px solid #1E8E5A;color:#1E8E5A;font-weight:800;border-radius:6px;transform:rotate(-4deg)}' +
    '.foot{margin-top:36px;font-size:11px;color:#6B7686;border-top:1px solid #E6EAF2;padding-top:12px}' +
    '.noprint{margin-top:24px}@media print{.noprint{display:none}}' +
    '</style></head><body>' +
    '<div class="top"><div><div class="logo">evenuefy</div><div class="muted">' + esc(EVENT.name) + ' · ' + esc(EVENT.dates) + '</div></div>' +
    '<div><h1>TAX INVOICE</h1><div class="muted right">Invoice No: <b>' + esc(invNo) + '</b><br>Date: ' + esc(a.paidAt || '') + '</div></div></div>' +
    '<div class="grid"><div><div class="muted">BILLED TO</div><b>' + esc(EVENT.exhibitor) + '</b><br>' + esc(EVENT.exhibitorCountry) + '</div>' +
    '<div class="right"><div class="muted">APPLICATION</div><b>' + esc(a.appNo || '') + '</b><br><span class="stamp">PAID</span></div></div>' +
    '<table><tr><th>Description</th><th class="right">Amount</th></tr>' +
    '<tr><td>Aircraft Registration — ' + esc(a.model) + ' (' + esc(a.make) + ')<br>' +
    '<span class="muted">Reg. No. ' + esc(a.regNo) + ' · ' + esc(a.displayType) + ' · ' + Number(a.weight).toLocaleString('en-IN') + ' kg · Static Display rate chart</span></td>' +
    '<td class="right">' + esc(fee) + '</td></tr>' +
    '<tr class="total"><td>Total (' + (a.feeCurrency === 'USD' ? 'USD' : 'INR, incl. GST') + ')</td><td class="right">' + esc(fee) + '</td></tr></table>' +
    '<div class="foot">This is a computer-generated invoice for the aircraft registration fee collected on behalf of the organiser. ' + esc(EVENT.name) + '.</div>' +
    '<div class="noprint"><button onclick="window.print()" style="background:#2F62D8;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer">Print / Save as PDF</button></div>' +
    '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the invoice.', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

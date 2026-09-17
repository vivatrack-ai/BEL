import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../services/api.js';
import {
  ADM_SETUP_TYPES, ADM_SIZE_TYPES, ADM_SIDES_TYPES, ADM_SIZE_BUCKETS,
  ADM_FLOOR_OPTS, ADM_SIDE_OPTS, fmtSqm,
} from '../lib.js';
import { Icon, Pill, Modal, Field, toast } from '../components/ui.jsx';
import { useAdminData, AdminFooter } from './adminShared.jsx';

export default function AdminSpaceRequirements() {
  const { data, reload } = useAdminData();
  const [types, setTypes] = useState([]);
  const [size, setSize] = useState(null);
  const [floors, setFloors] = useState(null);
  const [sides, setSides] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPer, setRowsPer] = useState(10);
  const [bulk, setBulk] = useState(false);
  const [bmSubject, setBmSubject] = useState('');
  const [bmBody, setBmBody] = useState('');
  const [bmErrs, setBmErrs] = useState({});
  if (!data) return null;

  const exById = (id) => data.exhibitors.find((e) => e.id === id);
  const reqsOf = (exId) => data.requirements.filter((r) => r.exId === exId);

  const toggleType = (t) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    setTypes(next);
    if (!next.some((x) => ADM_SIZE_TYPES.includes(x))) setSize(null);
    if (!next.includes('Chalet')) setFloors(null);
    if (!next.some((x) => ADM_SIDES_TYPES.includes(x))) setSides(null);
    setPage(1);
  };
  const clearFilters = () => { setTypes([]); setSize(null); setFloors(null); setSides(null); setPage(1); };

  const filtered = data.requirements.filter((r) => {
    if (types.length && !types.includes(r.setupType)) return false;
    if (size && ADM_SIZE_TYPES.includes(r.setupType)) {
      const b = ADM_SIZE_BUCKETS.find((x) => x.id === size);
      if (!b.test(r.sqm)) return false;
    }
    if (floors && r.setupType === 'Chalet' && r.floors !== floors) return false;
    if (sides && ADM_SIDES_TYPES.includes(r.setupType) && r.openSides !== sides) return false;
    return true;
  });

  const sizeVisible = types.some((t) => ADM_SIZE_TYPES.includes(t));
  const floorsVisible = types.includes('Chalet');
  const sidesVisible = types.some((t) => ADM_SIDES_TYPES.includes(t));
  const anyFilter = types.length || size || floors || sides;

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPer));
  const curPage = Math.min(page, totalPages);
  const start = (curPage - 1) * rowsPer;
  const pageList = filtered.slice(start, start + rowsPer);
  const allChecked = filtered.length > 0 && filtered.every((r) => sel.has(r.id));

  const toggleSel = (id, checked) => {
    const n = new Set(sel);
    if (checked) n.add(id); else n.delete(id);
    setSel(n);
  };
  const toggleSelAll = (checked) => {
    const n = new Set(sel);
    filtered.forEach((r) => { if (checked) n.add(r.id); else n.delete(r.id); });
    setSel(n);
  };

  /* Bulk email — recipients de-duplicated per exhibitor */
  const emailTargets = () => {
    const reqs = sel.size ? data.requirements.filter((r) => sel.has(r.id)) : filtered;
    const byEx = new Map();
    reqs.forEach((r) => {
      if (!byEx.has(r.exId)) byEx.set(r.exId, []);
      byEx.get(r.exId).push(r);
    });
    return [...byEx.entries()].map(([exId, rs]) => ({ ex: exById(exId), reqs: rs })).filter((t) => t.ex && t.ex.email);
  };

  const sendBulk = async () => {
    const er = {};
    if (!bmSubject.trim()) er.subject = 'Subject is required';
    if (!bmBody.trim()) er.body = 'Message is required';
    setBmErrs(er);
    if (Object.keys(er).length) return;
    const targets = emailTargets();
    await adminApi.sendBulkEmail({ subject: bmSubject.trim(), recipients: targets.map((t) => t.ex.email) });
    setSel(new Set());
    setBulk(false); setBmSubject(''); setBmBody('');
    await reload();
    toast('Bulk email sent to ' + targets.length + ' exhibitor(s)', 'success');
  };

  const chip = (on, label, onClick) => (
    <button key={label} className={'fchip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>
  );

  const targets = bulk ? emailTargets() : [];

  return (
    <>
      <h1 className="page-title">Space Requirements</h1>
      <p className="page-sub">Stall inquiries from exhibiting companies — one row per requirement (an exhibitor can submit more than one). Filter the segment you need, then send them a bulk email.</p>

      <div className="card">
        <div className="card-head-row">
          <h2 className="card-title">Filter — Space Requirement</h2>
          {anyFilter ? (
            <button className="btn btn-outline btn-sm filter-clear" onClick={clearFilters}>
              <Icon name="filter_alt_off" style={{ fontSize: 16 }} />Clear Filters
            </button>
          ) : null}
        </div>
        <div className="filter-panel">
          <div className="filter-row">
            <span className="filter-label">Space Setup Type</span>
            <div className="filter-chips">{ADM_SETUP_TYPES.map((t) => chip(types.includes(t), t, () => toggleType(t)))}</div>
          </div>
          {sizeVisible && (
            <div className="filter-row">
              <span className="filter-label">Size Filter</span>
              <div className="filter-chips">{ADM_SIZE_BUCKETS.map((b) => chip(size === b.id, b.label, () => { setSize(size === b.id ? null : b.id); setPage(1); }))}</div>
            </div>
          )}
          {floorsVisible && (
            <div className="filter-row">
              <span className="filter-label">Number of Floors</span>
              <div className="filter-chips">{ADM_FLOOR_OPTS.map((f) => chip(floors === f, f, () => { setFloors(floors === f ? null : f); setPage(1); }))}</div>
            </div>
          )}
          {sidesVisible && (
            <div className="filter-row">
              <span className="filter-label">Open Sides (Shell &amp; Raw)</span>
              <div className="filter-chips">{ADM_SIDE_OPTS.map((s) => chip(sides === s, s, () => { setSides(sides === s ? null : s); setPage(1); }))}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-head-row">
          <h2 className="card-title">Requirement List</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="result-count">{filtered.length} of {data.requirements.length} requirements</span>
            <button className="btn btn-primary btn-sm" disabled={!filtered.length && !sel.size} onClick={() => setBulk(true)}>
              <Icon name="mail" style={{ fontSize: 16 }} />
              {sel.size ? 'Send Bulk Email (' + sel.size + ' selected)' : 'Send Bulk Email (all ' + filtered.length + ' filtered)'}
            </button>
          </div>
        </div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr>
            <th><input type="checkbox" checked={allChecked} onChange={(e) => toggleSelAll(e.target.checked)} title="Select all filtered (across pages)" /></th>
            <th>Profile Info</th><th>Contact Info</th><th>Reg. No.</th><th>Setup Type</th><th>Size</th><th>Floors</th><th>Open Sides</th><th>Action</th>
          </tr>
          {pageList.length ? pageList.map((r) => {
            const ex = exById(r.exId);
            const all = reqsOf(r.exId);
            return (
              <tr key={r.id}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={(e) => toggleSel(r.id, e.target.checked)} /></td>
                <td><div className="profile-cell">
                  <span className="avatar">{(ex.company || '?').charAt(0).toUpperCase()}</span>
                  <span>
                    <span className="td-strong">{ex.company}</span>
                    {all.length > 1 && (
                      <span className="td-sub"><Pill color="blue" title={'This exhibitor has submitted ' + all.length + ' requirements'}>
                        Req {all.indexOf(r) + 1} of {all.length}
                      </Pill></span>
                    )}
                  </span>
                </div></td>
                <td className="contact-cell">{ex.email}<br /><span className="ph">{ex.phone}</span></td>
                <td>{ex.regNo ? <span className="regno">{ex.regNo}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td><Pill color="gray">{r.setupType}</Pill></td>
                <td className="num">{fmtSqm(r.sqm)}</td>
                <td>{r.floors || '—'}</td>
                <td>{r.openSides || '—'}</td>
                <td className="td-actions"><Link className="btn-link" to={'/admin/exhibitor/' + ex.id}>View Details</Link></td>
              </tr>
            );
          }) : <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>No requirements match the selected filters.</td></tr>}
        </tbody></table></div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: '0.83rem', color: 'var(--muted)' }}>
          <span>Rows{' '}
            <select value={rowsPer} onChange={(e) => { setRowsPer(parseInt(e.target.value, 10)); setPage(1); }}
              style={{ border: '1px solid #CFD7E4', borderRadius: 7, padding: '4px 8px', fontFamily: 'inherit', fontSize: '0.83rem', marginLeft: 4 }}>
              {[10, 25, 50].map((n) => <option key={n}>{n}</option>)}
            </select>
          </span>
          <span>Showing <b style={{ color: 'var(--ink)' }}>{filtered.length ? start + 1 : 0}</b> to <b style={{ color: 'var(--ink)' }}>{Math.min(start + rowsPer, filtered.length)}</b> of <b style={{ color: 'var(--ink)' }}>{filtered.length}</b></span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-outline btn-sm" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
              <Icon name="keyboard_arrow_left" style={{ fontSize: 17 }} />
            </button>
            <span style={{ alignSelf: 'center', fontWeight: 700, color: 'var(--ink)' }}>{curPage} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>
              <Icon name="keyboard_arrow_right" style={{ fontSize: 17 }} />
            </button>
          </span>
        </div>
      </div>

      {data.emailLog.length > 0 && (
        <div className="card section-gap">
          <h2 className="card-title">Bulk Email History</h2>
          <div className="tablewrap"><table className="grid"><tbody>
            <tr><th>Sr.</th><th>Subject</th><th>Recipients</th><th>Sent At</th></tr>
            {data.emailLog.slice(0, 5).map((l, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td className="td-strong">{l.subject}</td>
                <td className="num">{l.count} exhibitor(s)</td>
                <td className="num">{l.sentAt}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}

      {bulk && (
        <Modal wide title="Send Bulk Email" onClose={() => setBulk(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setBulk(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={sendBulk}><Icon name="send" />Send Email</button>
          </>}>
          <div className="note" style={{ marginTop: 0 }}>
            <b className="title">{targets.length} exhibitor(s) will receive this email</b>
            Based on {sel.size ? sel.size + ' selected requirement(s)' : 'all ' + filtered.length + ' filtered requirement(s)'}.
            Each company is emailed once, even if it has multiple requirement entries.
          </div>
          <div className="tablewrap" style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6 }}>
            <table className="grid"><tbody>
              <tr><th>Sr.</th><th>Exhibitor</th><th>Requirements</th></tr>
              {targets.slice(0, 50).map((t, i) => (
                <tr key={t.ex.id}>
                  <td className="num">{i + 1}</td>
                  <td><span className="td-strong">{t.ex.company}</span><span className="td-sub">{t.ex.regNo || '—'} · {t.ex.email}</span></td>
                  <td>{t.reqs.map((r) => <div key={r.id}><Pill color="gray">{r.setupType}</Pill> {r.sqm != null ? fmtSqm(r.sqm) : (r.floors || '')}</div>)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
          {targets.length > 50 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>…and {targets.length - 50} more recipients.</p>}
          <Field label="Subject" required error={bmErrs.subject}>
            <input type="text" value={bmSubject} onChange={(e) => setBmSubject(e.target.value)} placeholder="e.g. Aero India 2027 — Space allotment update" />
          </Field>
          <Field label="Message" required error={bmErrs.body} hint={'Placeholders: {{company}}, {{requirement}} (auto-filled per exhibitor)'}>
            <textarea rows={5} value={bmBody} onChange={(e) => setBmBody(e.target.value)}
              style={{ width: '100%', border: '1px solid #CFD7E4', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '0.9rem' }}
              placeholder="Write your message… ({{company}} and {{requirement}} will be personalised per exhibitor)" />
          </Field>
        </Modal>
      )}
      <AdminFooter reload={reload} />
    </>
  );
}

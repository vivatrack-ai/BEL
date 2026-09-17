import { Link, useParams } from 'react-router-dom';
import { fmtSqm } from '../lib.js';
import { Icon, Pill } from '../components/ui.jsx';
import { useAdminData, AdminFooter } from './adminShared.jsx';

export default function AdminExhibitorDetail() {
  const { exId } = useParams();
  const { data, reload } = useAdminData();
  if (!data) return null;

  const ex = data.exhibitors.find((e) => e.id === exId);
  if (!ex) return null;
  const reqs = data.requirements.filter((r) => r.exId === exId);
  const totalSqm = reqs.reduce((a, r) => a + (r.sqm || 0), 0);

  return (
    <>
      <Link className="back-link" to="/admin/space-requirements">
        <Icon name="arrow_back" style={{ fontSize: 16 }} />Back to Space Requirements
      </Link>
      <h1 className="page-title">{ex.company}</h1>
      <p className="page-sub">Exhibitor detailed view — Aero India 2027</p>

      <div className="card">
        <h2 className="card-title">Company Information</h2>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div><b>Registration No.:</b> {ex.regNo ? <span className="regno">{ex.regNo}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</div>
          <div><b>Email:</b> {ex.email}</div>
          <div><b>Mobile:</b> {ex.phone || '—'}</div>
          <div><b>Requirements Submitted:</b> {reqs.length}{totalSqm ? ' (' + totalSqm.toLocaleString('en-IN') + ' sqm total)' : ''}</div>
        </div>
      </div>

      <div className="section-gap">
        <div className="card-head-row" style={{ marginBottom: 10 }}>
          <h2 className="card-title" style={{ fontSize: '1.15rem' }}>
            Space Requirement <Pill color="blue">{reqs.length} requirement{reqs.length === 1 ? '' : 's'}</Pill>
          </h2>
        </div>
        {reqs.length > 1 && (
          <div className="note" style={{ marginTop: 0 }}>
            <b className="title">Multiple requirements</b>
            {ex.company} has submitted {reqs.length} space requirements:
            <ul style={{ marginTop: 6 }}>
              {reqs.map((r) => (
                <li key={r.id}>
                  <b>{r.setupType}</b>{r.sqm != null ? ' — ' + fmtSqm(r.sqm) : ''}{r.floors ? ' · ' + r.floors : ''}{r.openSides ? ' · ' + r.openSides : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {reqs.length ? reqs.map((r, i) => (
          <div className="card" key={r.id} style={{ borderLeft: '3px solid var(--blue)', marginTop: i ? 14 : 0 }}>
            <div className="card-head-row">
              <h2 className="card-title">Requirement {i + 1}{reqs.length > 1 ? ' of ' + reqs.length : ''}</h2>
            </div>
            <div className="tiles" style={{ marginBottom: 0 }}>
              <div className="tile blue"><div className="t-label">Stall Type</div><div className="t-value" style={{ fontSize: '1.15rem' }}>{r.setupType}</div></div>
              {r.sqm != null && (
                <div className="tile"><div className="t-label">Requested Size</div><div className="t-value">{Number(r.sqm).toLocaleString('en-IN')}<span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}> sqm</span></div></div>
              )}
              {r.floors && (
                <div className="tile"><div className="t-label">Number of Floors</div><div className="t-value" style={{ fontSize: '1.15rem' }}>{r.floors}</div></div>
              )}
              {r.openSides && (
                <div className="tile"><div className="t-label">Open Sides</div><div className="t-value" style={{ fontSize: '1.15rem' }}>{r.openSides}</div></div>
              )}
            </div>
          </div>
        )) : (
          <div className="card"><div className="empty">
            <Icon name="design_services" /><h3>No space requirement submitted</h3>
          </div></div>
        )}
      </div>
      <AdminFooter reload={reload} />
    </>
  );
}

import { Link } from 'react-router-dom';
import { ADM_SETUP_TYPES, ADM_SIZE_TYPES, ADM_SIZE_BUCKETS, fmtSqm } from '../lib.js';
import { Icon, Pill } from '../components/ui.jsx';
import { useAdminData, AdminFooter } from './adminShared.jsx';

const Bars = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="bar-rows">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span>{r.label}</span>
          <span className="track"><i className="fill" style={{ width: Math.round((r.n / max) * 100) + '%' }}></i></span>
          <span className="val">{r.n}</span>
        </div>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const { data, reload } = useAdminData();
  if (!data) return null;
  const reqs = data.requirements;
  const exById = (id) => data.exhibitors.find((e) => e.id === id);

  const totalSqm = reqs.reduce((a, r) => a + (r.sqm || 0), 0);
  const chalets = reqs.filter((r) => r.setupType === 'Chalet').length;
  const exWithReqs = new Set(reqs.map((r) => r.exId)).size;
  const multiCompanies = data.exhibitors.filter((ex) => reqs.filter((r) => r.exId === ex.id).length > 1).length;

  const typeRows = ADM_SETUP_TYPES.map((t) => ({ label: t, n: reqs.filter((r) => r.setupType === t).length }));
  const sizeRows = ADM_SIZE_BUCKETS.map((b) => ({
    label: b.label,
    n: reqs.filter((r) => ADM_SIZE_TYPES.includes(r.setupType) && b.test(r.sqm)).length,
  }));

  return (
    <>
      <h1 className="page-title">Space Requirement Dashboard</h1>
      <p className="page-sub">Overview of space booking requirements captured from exhibitors. One exhibitor can submit multiple requirements.</p>

      <div className="tiles">
        <div className="tile blue"><div className="t-label">Total Requirements</div><div className="t-value">{reqs.length}</div></div>
        <div className="tile"><div className="t-label">Exhibitors</div><div className="t-value">{exWithReqs}</div></div>
        <div className="tile"><div className="t-label">Total Space Requested</div><div className="t-value">{totalSqm.toLocaleString('en-IN')}<span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}> sqm</span></div></div>
        <div className="tile accent"><div className="t-label">Multi-Requirement Companies</div><div className="t-value">{multiCompanies}</div></div>
        <div className="tile"><div className="t-label">Chalet Requests</div><div className="t-value">{chalets}</div></div>
      </div>

      <div className="form-grid">
        <div className="card"><h2 className="card-title">By Space Setup Type</h2><Bars rows={typeRows} /></div>
        <div className="card" style={{ marginTop: 0 }}><h2 className="card-title">By Size (Shell · Raw · Pavilion · Outdoor)</h2><Bars rows={sizeRows} /></div>
      </div>

      <div className="card section-gap">
        <div className="card-head-row">
          <h2 className="card-title">Recent Submissions</h2>
          <Link className="btn btn-outline btn-sm" to="/admin/space-requirements">
            View All<Icon name="chevron_right" style={{ fontSize: 16 }} />
          </Link>
        </div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>Profile Info</th><th>Contact Info</th><th>Reg. No.</th><th>Setup Type</th><th>Size</th><th>Action</th></tr>
          {reqs.slice(0, 5).map((r) => {
            const ex = exById(r.exId);
            return (
              <tr key={r.id}>
                <td><div className="profile-cell">
                  <span className="avatar">{(ex.company || '?').charAt(0).toUpperCase()}</span>
                  <span className="td-strong">{ex.company}</span>
                </div></td>
                <td className="contact-cell">{ex.email}<br /><span className="ph">{ex.phone}</span></td>
                <td>{ex.regNo ? <span className="regno">{ex.regNo}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td><Pill color="gray">{r.setupType}</Pill></td>
                <td className="num">{fmtSqm(r.sqm)}</td>
                <td className="td-actions"><Link className="btn-link" to={'/admin/exhibitor/' + ex.id}>View</Link></td>
              </tr>
            );
          })}
        </tbody></table></div>
      </div>
      <AdminFooter reload={reload} />
    </>
  );
}

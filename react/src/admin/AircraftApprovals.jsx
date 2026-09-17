import { Link } from 'react-router-dom';
import { adminApi } from '../services/api.js';
import { EX_COMPANY } from '../lib.js';
import { Icon, Pill, toast } from '../components/ui.jsx';
import { useAircraftApps, acFmtFee, acStatusPill, acPayPill } from './adminShared.jsx';

const FORM_LABELS = { air7a: 'Air-7A', air4: 'Air-4', air7b: '7B & 9' };

export function FormsDone({ a }) {
  return (
    <>
      <Pill color="green">Form 1 ✓</Pill>{' '}
      {['air7a', 'air4', 'air7b'].map((f) => (
        a[f]
          ? <span key={f}><Pill color="green">{FORM_LABELS[f]} ✓</Pill>{' '}</span>
          : <span key={f}><Pill color="amber">{FORM_LABELS[f]} —</Pill>{' '}</span>
      ))}
    </>
  );
}

export function useApprovalActions(reload) {
  const approve = async (a) => {
    if (!window.confirm('Approve application ' + (a.appNo || '') + ' (' + a.model + ')?\nThe registration fee ' + acFmtFee(a) + ' will be enabled for payment in the exhibitor’s cart.')) return;
    await adminApi.approveAircraft(a.id);
    await reload();
    toast('Application ' + (a.appNo || '') + ' approved — fee enabled for payment.', 'success');
  };
  const reject = async (a) => {
    const remark = window.prompt('Reason for rejection (shown to the exhibitor):', '');
    if (remark === null) return;
    await adminApi.rejectAircraft(a.id, remark.trim());
    await reload();
    toast('Application ' + (a.appNo || '') + ' rejected.', 'error');
  };
  return { approve, reject };
}

export default function AircraftApprovals() {
  const { apps, reload } = useAircraftApps();
  const { approve, reject } = useApprovalActions(reload);
  if (!apps) return null;

  const counts = {
    total: apps.length,
    submitted: apps.filter((a) => a.status === 'submitted').length,
    approved: apps.filter((a) => a.status === 'approved').length,
    registered: apps.filter((a) => a.status === 'registered').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
  };

  return (
    <>
      <h1 className="page-title">Aircraft Approvals</h1>
      <p className="page-sub">Committee approval for aircraft registration applications. On approval, the registration fee is pushed to the exhibitor’s cart for payment.</p>

      <div className="tiles">
        <div className="tile blue"><div className="t-label">Total Applications</div><div className="t-value">{counts.total}</div></div>
        <div className="tile"><div className="t-label">Pending Approval</div><div className="t-value">{counts.submitted}</div></div>
        <div className="tile"><div className="t-label">Approved · Unpaid</div><div className="t-value">{counts.approved}</div></div>
        <div className="tile accent"><div className="t-label">Registered (Paid)</div><div className="t-value">{counts.registered}</div></div>
        <div className="tile"><div className="t-label">Rejected</div><div className="t-value">{counts.rejected}</div></div>
      </div>

      <div className="card">
        <div className="card-head-row">
          <h2 className="card-title">Applications</h2>
          <button className="btn btn-outline btn-sm" onClick={reload}><Icon name="refresh" style={{ fontSize: 16 }} />Refresh</button>
        </div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>Application No.</th><th>Aircraft / Exhibitor</th><th>Fee</th><th>Forms</th><th>Application Status</th><th>Payment Status</th><th>Action</th></tr>
          {apps.length ? apps.map((a) => (
            <tr key={a.id}>
              <td><span className="regno">{a.appNo || '—'}</span></td>
              <td><div className="profile-cell">
                <span className="avatar">{EX_COMPANY.charAt(0)}</span>
                <span>
                  <span className="td-strong">{a.model}</span>
                  <span className="td-sub">{EX_COMPANY}</span>
                  <span className="td-sub">{a.usage} · {a.displayType} · {Number(a.weight).toLocaleString('en-IN')} kg · <span className="regno">{a.regNo}</span></span>
                </span>
              </div></td>
              <td className="money">{acFmtFee(a)}</td>
              <td style={{ minWidth: 170 }}><FormsDone a={a} /></td>
              <td>
                {acStatusPill(a.status)}
                {a.status === 'rejected' && a.remark && <span className="td-sub" style={{ color: 'var(--red)' }}>{a.remark}</span>}
              </td>
              <td>{acPayPill(a)}</td>
              <td className="td-actions">
                <Link className="btn-link" to={'/admin/aircraft-application/' + a.id}>View</Link>
                {a.status === 'submitted' && (
                  <>
                    <button className="btn-link" style={{ color: 'var(--green)' }} onClick={() => approve(a)}>Approve</button>
                    <button className="btn-link danger" onClick={() => reject(a)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          )) : <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>No aircraft applications received yet.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}

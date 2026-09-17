import { useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useExhibitorState, actions } from '../../store/exhibitorStore.js';
import { fmtFee } from '../../lib.js';
import { Icon, Pill, toast, FooterTools } from '../../components/ui.jsx';
import { AcftHeader, appStatusPill, payStatusPill, nextStepPath, downloadInvoice } from './shared.jsx';

const FORM_LABELS = { air7a: 'Air-7A', air4: 'Air-4', air7b: '7B & 9' };

export default function AircraftList() {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const { openCart } = useOutletContext();

  // approved applications push their fee to the cart
  useEffect(() => { actions.syncApprovedFees(); }, []);

  if (!state) return null;

  if (state.aircraft.length === 0) {
    return (
      <>
        <AcftHeader active="list" />
        <div className="card"><div className="empty">
          <Icon name="flight" />
          <h3>No aircraft registered yet</h3>
          <p>Start with the Aircraft Detail form. The registration fee (based on aircraft weight) is added to your cart.</p>
          <Link className="btn btn-primary" to="/exhibitor/aircraft/add"><Icon name="add" />Register Aircraft</Link>
        </div></div>
        <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
      </>
    );
  }

  const del = async (a) => {
    if (!window.confirm('Delete this aircraft and its forms?')) return;
    await actions.deleteAircraft(a.id);
    toast('Aircraft deleted', 'success');
  };

  const formsDone = (a) => (
    <>
      <Pill color="green">Form 1 ✓</Pill>{' '}
      {['air7a', 'air4', 'air7b'].map((f) => (
        a[f]
          ? <span key={f}><Pill color="green">{FORM_LABELS[f]} ✓</Pill>{' '}</span>
          : <span key={f}><Pill color="amber">{FORM_LABELS[f]} pending</Pill>{' '}</span>
      ))}
    </>
  );

  const actionsFor = (a) => {
    if (a.status === 'draft') return (
      <>
        <button className="btn-link" style={{ color: 'var(--green)' }} onClick={() => navigate(nextStepPath(a))}>Continue</button>
        <button className="btn-link" onClick={() => navigate('/exhibitor/aircraft/add?edit=' + a.id)}>Edit</button>
        <button className="btn-link danger" onClick={() => del(a)}>Delete</button>
      </>
    );
    if (a.status === 'rejected') return (
      <>
        <button className="btn-link" onClick={() => navigate('/exhibitor/aircraft/add?edit=' + a.id)}>Edit &amp; Resubmit</button>
        <button className="btn-link danger" onClick={() => del(a)}>Delete</button>
      </>
    );
    if (a.status === 'approved' && a.price != null)
      return <button className="btn-link" onClick={openCart}>Pay Now</button>;
    if (a.status === 'submitted')
      return <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Awaiting committee</span>;
    if (a.status === 'registered' && a.price != null)
      return (
        <button className="btn-link" onClick={() => downloadInvoice(a)}>
          <Icon name="receipt_long" style={{ fontSize: 15, verticalAlign: -3 }} /> Invoice
        </button>
      );
    return '—';
  };

  const payPending = state.aircraft.filter((a) => a.status === 'approved' && a.price != null).length;
  const awaiting = state.aircraft.filter((a) => a.status === 'submitted').length;

  return (
    <>
      <AcftHeader active="list" />

      {payPending > 0 && (
        <div className="note green">
          <b className="title">{payPending} application(s) approved by the committee</b>
          The registration fee is now in your cart — complete the payment to finish the registration.{' '}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={openCart}>
            <Icon name="shopping_cart" style={{ fontSize: 16 }} />Complete Payment
          </button>
        </div>
      )}
      {awaiting > 0 && (
        <div className="note amber">
          <b className="title">{awaiting} application(s) awaiting committee approval</b>
          Payment will be enabled once the committee approves the application.
        </div>
      )}

      <div className="card">
        <div className="card-head-row">
          <h2 className="card-title">My Aircraft Applications</h2>
          <Link className="btn btn-primary" to="/exhibitor/aircraft/add"><Icon name="add" />New Application</Link>
        </div>
        <div className="tablewrap"><table className="grid"><tbody>
          <tr><th>Sr.</th><th>Application No.</th><th>Aircraft</th><th>Reg. Fee</th><th>Application Status</th><th>Payment Status</th><th>Forms</th><th>Action</th></tr>
          {state.aircraft.map((a, i) => (
            <tr key={a.id}>
              <td className="num">{i + 1}</td>
              <td><span className="regno">{a.appNo || '—'}</span></td>
              <td>
                <span className="td-strong">{a.model}</span>
                <span className="td-sub">{a.make} · {a.usage} · {a.displayType}</span>
                <span className="td-sub">{Number(a.weight).toLocaleString('en-IN')} kg · <span className="regno">{a.regNo}</span></span>
              </td>
              <td className="money">{a.price != null ? fmtFee(a.price, a.feeCurrency) : '—'}</td>
              <td>
                {appStatusPill(a)}
                {a.status === 'rejected' && a.remark && <span className="td-sub" style={{ color: 'var(--red)' }}>{a.remark}</span>}
              </td>
              <td>{payStatusPill(a)}</td>
              <td style={{ minWidth: 170 }}>{formsDone(a)}</td>
              <td className="td-actions">{actionsFor(a)}</td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}

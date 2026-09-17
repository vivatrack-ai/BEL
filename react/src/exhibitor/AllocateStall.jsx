import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExhibitorState, actions, stallAvailable, stallEligibleCoex, coexById } from '../store/exhibitorStore.js';
import { scrollToFirstError } from '../lib.js';
import { Icon, Modal, Field, toast, FooterTools } from '../components/ui.jsx';

function AllocForm({ state, alloc, onDone, onCancel, inModal }) {
  const subs = stallEligibleCoex(state);
  const halls = [...new Set(state.stalls.map((s) => s.hall))];
  const [coexId, setCoexId] = useState(alloc ? alloc.coexId : subs[0]?.id || '');
  const [hall, setHall] = useState(alloc ? state.stalls.find((s) => s.id === alloc.stallId).hall : halls[0]);
  const stallsInHall = state.stalls.filter((s) => s.hall === hall);
  const [stallId, setStallId] = useState(alloc ? alloc.stallId : stallsInHall[0]?.id || '');
  const [sqm, setSqm] = useState(alloc ? String(alloc.sqm) : '');
  const [errs, setErrs] = useState({});

  const effStallId = stallsInHall.some((s) => s.id === stallId) ? stallId : stallsInHall[0]?.id;
  const avail = effStallId ? stallAvailable(state, effStallId, alloc ? alloc.id : undefined) : 0;
  const val = parseInt(sqm, 10);
  const over = !isNaN(val) && val > avail;

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!coexId) er.coex = 'Select a co-exhibitor';
    else {
      const c = coexById(state, coexId);
      if (!c || c.type !== 'separate' || c.status !== 'active') er.coex = 'Stall space can be allocated only to Separate co-exhibitors with completed registration payment';
    }
    if (!effStallId) er.stall = 'Select a stall';
    if (isNaN(val) || val <= 0) er.sqm = 'Enter a valid area in sqm';
    else if (val > avail) er.sqm = 'Cannot allocate more than available space (' + avail + ' sqm) on this stall';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    await actions.saveAllocation({ editId: alloc ? alloc.id : null, coexId, stallId: effStallId, sqm: val });
    toast(alloc ? 'Allocation updated' : val + ' sqm allocated to ' + coexById(state, coexId).company, 'success');
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Co-Exhibitor" required error={errs.coex}>
          <select value={coexId} onChange={(e) => setCoexId(e.target.value)}>
            {subs.map((c) => <option key={c.id} value={c.id}>{c.company} (Separate · Paid)</option>)}
          </select>
        </Field>
        <Field label="Hall" required error={errs.hall}>
          <select value={hall} onChange={(e) => { setHall(e.target.value); const first = state.stalls.find((s) => s.hall === e.target.value); setStallId(first ? first.id : ''); }}>
            {halls.map((h) => <option key={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Stall" required error={errs.stall}>
          <select value={effStallId} onChange={(e) => setStallId(e.target.value)}>
            {stallsInHall.map((s) => <option key={s.id} value={s.id}>{s.stall} — {s.area} sqm booked</option>)}
          </select>
        </Field>
        <Field label="Allocate Space (Sqm)" required error={errs.sqm}
          hint={effStallId ? 'Available on this stall: ' + avail + ' sqm' + (over ? ' — exceeds available space!' : '') : ''}>
          <input type="number" min="1" step="1" value={sqm} onChange={(e) => setSqm(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        {inModal && <button className="btn btn-outline" type="button" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" type="submit">
          <Icon name="check" />{alloc ? 'Update Allocation' : 'Allocate Space'}
        </button>
      </div>
    </form>
  );
}

export default function AllocateStall() {
  const state = useExhibitorState();
  const [modal, setModal] = useState(null); // {alloc|null}
  if (!state) return null;

  const subs = stallEligibleCoex(state);
  if (subs.length === 0) {
    return (
      <>
        <h1 className="page-title">Allocate Stall</h1>
        <p className="page-sub">Stall space can be allocated only to <b>Separate</b> co-exhibitors whose registration payment is complete.</p>
        <div className="card"><div className="empty">
          <Icon name="group_add" />
          <h3>No paid Separate co-exhibitors yet</h3>
          <p>Add a Separate co-exhibitor and complete its registration payment first, then allocate stall space.</p>
          <Link className="btn btn-primary" to="/exhibitor/co-exhibitors/add"><Icon name="add" />Add Co-Exhibitor</Link>
        </div></div>
        <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
      </>
    );
  }

  const remove = async (a) => {
    if (!window.confirm('Remove this allocation? The area returns to your available pool.')) return;
    await actions.removeAllocation(a.id);
    toast('Allocation removed', 'success');
  };

  return (
    <>
      <h1 className="page-title">Allocate Stall</h1>
      <p className="page-sub">Distribute your booked stall space among <b>Separate</b> co-exhibitors (registration payment complete). You cannot allocate more than the space you have booked.</p>

      <div className="tiles">
        {state.stalls.map((st) => {
          const avail = stallAvailable(state, st.id);
          const pct = Math.round(((st.area - avail) / st.area) * 100);
          return (
            <div className="tile" key={st.id}>
              <div className="t-label">{st.hall} · {st.stall}</div>
              <div className="t-value">{avail}<span style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}> / {st.area} sqm free</span></div>
              <div className="usage"><div className="bar"><i style={{ width: pct + '%' }}></i></div><span>{pct}% allocated</span></div>
            </div>
          );
        })}
      </div>

      {state.allocations.length ? (
        <div className="card">
          <div className="card-head-row">
            <h2 className="card-title">Allocated Stall List</h2>
            <button className="btn btn-primary" onClick={() => setModal({ alloc: null })}><Icon name="add" />Allocate Area</button>
          </div>
          <div className="tablewrap"><table className="grid">
            <tbody>
              <tr><th>Sr.</th><th>Co-Exhibitor</th><th>Hall</th><th>Stall</th><th>Allocated Space</th><th>Action</th></tr>
              {state.allocations.map((a, i) => {
                const c = coexById(state, a.coexId);
                const st = state.stalls.find((x) => x.id === a.stallId);
                return (
                  <tr key={a.id}>
                    <td className="num">{i + 1}</td>
                    <td><span className="td-strong">{c.company}</span><span className="td-sub">{c.email}</span></td>
                    <td>{st.hall}</td><td>{st.stall}</td>
                    <td className="num">{a.sqm} sqm</td>
                    <td className="td-actions">
                      <button className="btn-link" onClick={() => setModal({ alloc: a })}>Edit</button>
                      <button className="btn-link danger" onClick={() => remove(a)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      ) : (
        <div className="card">
          <h2 className="card-title">Allocate Space to Co-Exhibitor</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>No stall allocation yet — fill the form below to allocate area.</p>
          <AllocForm state={state} alloc={null} onDone={() => {}} onCancel={() => {}} />
        </div>
      )}

      {modal && (
        <Modal title={modal.alloc ? 'Edit Allocation' : 'Allocate Space to Co-Exhibitor'} onClose={() => setModal(null)}>
          <AllocForm state={state} alloc={modal.alloc} inModal onDone={() => setModal(null)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}

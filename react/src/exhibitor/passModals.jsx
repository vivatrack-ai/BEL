import { useState } from 'react';
import { actions, coexById, catById, passContextBalance } from '../store/exhibitorStore.js';
import { EVENT, EMAIL_RE, MOBILE_RE, VEHNO_RE, money, scrollToFirstError } from '../lib.js';
import { Icon, Modal, Field, Pill, toast } from '../components/ui.jsx';

/* ---------------- Add Pass (badge / invitee) ---------------- */
export function PassFormModal({ state, catId, coexId, onClose, onCarPass }) {
  const cat = catById(state, catId);
  const [f, setF] = useState({ first: '', last: '', email: '', mobile: '', desig: '' });
  const [days, setDays] = useState([]);
  const [addCar, setAddCar] = useState(false);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    const er = {};
    if (!f.first.trim()) er.first = 'Required';
    if (!f.last.trim()) er.last = 'Required';
    if (!f.email.trim() || !EMAIL_RE.test(f.email.trim())) er.email = 'Enter a valid email';
    if (!MOBILE_RE.test(f.mobile.trim())) er.mobile = 'Enter a valid 10-digit mobile number';
    if (cat.kind === 'invitee' && days.length === 0) er.days = 'Select at least one event date';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    if (passContextBalance(state, catId, coexId) <= 0 && cat.kind !== 'vehicle') {
      toast(coexId ? 'No quota balance left for this co-exhibitor in this category.' : 'No balance left in this category.', 'error');
      return;
    }
    await actions.addPass({
      catId, coexId: coexId || null,
      data: { firstName: f.first.trim(), lastName: f.last.trim(), email: f.email.trim(), mobile: f.mobile.trim(), designation: f.desig.trim(), dates: days },
    });
    toast('Pass saved for ' + f.first.trim() + ' ' + f.last.trim(), 'success');
    onClose();
    if (cat.kind === 'invitee' && addCar && onCarPass) onCarPass();
  };

  return (
    <Modal title={(coexId ? 'Add Pass (Co-Exhibitor)' : 'Add New') + ' · ' + cat.name} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}><Icon name="badge" />Save Pass</button>
      </>}>
      {coexId && (
        <div className="note" style={{ marginTop: 0 }}>
          <b className="title">Filling on behalf of {coexById(state, coexId).company}</b>
          This pass will consume the co-exhibitor’s assigned quota.
        </div>
      )}
      <div className="form-grid">
        <Field label="First Name" required error={errs.first}><input type="text" value={f.first} onChange={set('first')} /></Field>
        <Field label="Last Name" required error={errs.last}><input type="text" value={f.last} onChange={set('last')} /></Field>
        <Field label="Email" required error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Mobile" required error={errs.mobile}><input type="tel" value={f.mobile} onChange={set('mobile')} placeholder="10-digit mobile" /></Field>
        <Field label="Designation" full><input type="text" value={f.desig} onChange={set('desig')} /></Field>
        {cat.kind === 'invitee' && (
          <>
            <Field label="Event Date Selection" required full error={errs.days}>
              <div className="checks">
                {EVENT.eventDays.map((d) => (
                  <label key={d} className={'check-item' + (days.includes(d) ? ' selected' : '')}>
                    <input type="checkbox" checked={days.includes(d)}
                      onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
                    {d}
                  </label>
                ))}
              </div>
            </Field>
            <div className="field full">
              <label className={'check-item' + (addCar ? ' selected' : '')} style={{ display: 'inline-flex' }}>
                <input type="checkbox" checked={addCar} onChange={(e) => setAddCar(e.target.checked)} /> Add Car Pass for this invitee
              </label>
              <div className="hint">Car pass application opens after saving this invitee.</div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Send Link (e-invitee) ---------------- */
export function SendLinkModal({ state, catId, coexId, onClose }) {
  const cat = catById(state, catId);
  const [f, setF] = useState({ first: '', last: '', email: '' });
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    const er = {};
    if (!f.first.trim()) er.first = 'Required';
    if (!f.last.trim()) er.last = 'Required';
    if (!f.email.trim() || !EMAIL_RE.test(f.email.trim())) er.email = 'Enter a valid email';
    setErrs(er);
    if (Object.keys(er).length) return;
    await actions.sendInvite({ catId, coexId: coexId || null, firstName: f.first.trim(), lastName: f.last.trim(), email: f.email.trim() });
    toast('E-invitee link sent to ' + f.email.trim(), 'success');
    onClose();
  };

  return (
    <Modal title={'Send ' + (cat.kind === 'invitee' ? 'Invitee' : 'Pass') + ' Link · ' + cat.name} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}><Icon name="mail" />Send Link</button>
      </>}>
      {coexId && (
        <div className="note" style={{ marginTop: 0 }}>
          <b className="title">Sending for {coexById(state, coexId).company}</b>
          The registration completed via this link will consume the co-exhibitor’s quota.
        </div>
      )}
      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: '0.86rem' }}>
        An email notification with a self-registration link will be sent to the person below.
      </p>
      <div className="form-grid">
        <Field label="First Name" required error={errs.first}><input type="text" value={f.first} onChange={set('first')} /></Field>
        <Field label="Last Name" required error={errs.last}><input type="text" value={f.last} onChange={set('last')} /></Field>
        <Field label="Email" required error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Category of Passes"><input type="text" value={cat.name} readOnly /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- View Passes ---------------- */
export function ViewPassesModal({ state, catId, coexId, onClose }) {
  const cat = catById(state, catId);
  const list = state.passes.filter((p) => p.catId === catId && (coexId ? p.coexId === coexId : true));
  const isVeh = cat.kind === 'vehicle';
  const statusPill = (p) => p.status === 'issued' ? <Pill color="green">Issued</Pill> : <Pill color="amber">Payment Pending</Pill>;

  return (
    <Modal wide title={'Passes · ' + cat.name + (coexId ? ' · ' + coexById(state, coexId).company : '')} onClose={onClose}
      footer={<button className="btn btn-outline" onClick={onClose}>Close</button>}>
      <div className="tablewrap"><table className="grid">
        <tbody>
          {isVeh
            ? <tr><th>Sr.</th><th>Driver</th><th>Vehicle No.</th><th>Seater</th><th>Filled By</th><th>Status</th><th>Created</th></tr>
            : <tr><th>Sr.</th><th>Name</th><th>Email / Mobile</th>{cat.kind === 'invitee' && <th>Event Dates</th>}<th>Filled By</th><th>Status</th><th>Created</th></tr>}
          {list.length ? list.map((p, i) => {
            const by = p.coexId ? coexById(state, p.coexId).company : 'Exhibitor';
            return isVeh ? (
              <tr key={p.id}>
                <td className="num">{i + 1}</td>
                <td><span className="td-strong">{p.data.driverName}</span><span className="td-sub">{p.data.driverMobile}</span></td>
                <td>{p.data.vehicleNo}</td>
                <td>{p.data.seater} Seater{p.amount ? ' · ' + money(p.amount) : ' · Complimentary'}</td>
                <td>{by}</td><td>{statusPill(p)}</td><td className="num">{p.createdAt}</td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td className="num">{i + 1}</td>
                <td className="td-strong">{p.data.firstName} {p.data.lastName}</td>
                <td>{p.data.email}<span className="td-sub">{p.data.mobile}</span></td>
                {cat.kind === 'invitee' && <td>{(p.data.dates || []).map((d) => d.split(' ')[0] + ' Feb').join(', ')}</td>}
                <td>{by}</td><td>{statusPill(p)}</td><td className="num">{p.createdAt}</td>
              </tr>
            );
          }) : <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>No passes filled yet.</td></tr>}
        </tbody>
      </table></div>
    </Modal>
  );
}

/* ---------------- Vehicle Pass application ---------------- */
export function VehicleFormModal({ state, catId, coexId, onClose }) {
  const cat = catById(state, catId);
  const [f, setF] = useState({ name: '', mobile: '', vehNo: '', email: '', dlNo: '' });
  const [seater, setSeater] = useState('6');
  const [dlFile, setDlFile] = useState(null);
  const [challan, setChallan] = useState(null);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const ctxFreeLeft = coexId
    ? Math.max(0, passContextBalance(state, catId, coexId))
    : Math.max(0, cat.free - state.passes.filter((p) => p.catId === catId && p.amount === 0).length);
  const isFree = ctxFreeLeft > 0;

  const submit = async () => {
    const er = {};
    if (!f.name.trim()) er.name = 'Required';
    if (!MOBILE_RE.test(f.mobile.trim())) er.mobile = 'Enter a valid 10-digit mobile number';
    if (!f.vehNo.trim()) er.vehNo = 'Required';
    else if (!VEHNO_RE.test(f.vehNo.trim())) er.vehNo = 'Enter a valid vehicle number (e.g. KA 01 AB 1234)';
    if (!f.email.trim() || !EMAIL_RE.test(f.email.trim())) er.email = 'Enter a valid email';
    if (!f.dlNo.trim()) er.dlNo = 'Required';
    if (!dlFile) er.dlFile = 'Upload the driving licence';
    if (!challan) er.challan = 'Upload the delivery challan photo';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }
    if (coexId && passContextBalance(state, catId, coexId) <= 0) {
      toast('No quota balance left for this co-exhibitor in this category.', 'error');
      return;
    }
    const amount = isFree ? 0 : (seater === '6' ? 3500 : 5000);
    const vehNo = f.vehNo.trim().toUpperCase();
    await actions.addPass({
      catId, coexId: coexId || null,
      data: {
        driverName: f.name.trim(), driverMobile: f.mobile.trim(), vehicleNo: vehNo, email: f.email.trim(),
        dlNumber: f.dlNo.trim(), dlFile: dlFile.name, challanFile: challan.name, seater,
        company: coexId ? coexById(state, coexId).company : EVENT.exhibitor,
      },
      amount,
      status: isFree ? 'issued' : 'payment_pending',
      cartItem: isFree ? null : { label: 'Vehicle Pass — ' + seater + ' Seater (' + vehNo + ')', sub: 'Driver: ' + f.name.trim(), amount },
    });
    toast(isFree
      ? 'Complimentary vehicle pass issued for ' + vehNo
      : 'Vehicle pass added to cart — complete payment to issue it.', 'success');
    onClose();
  };

  return (
    <Modal title={'Vehicle Pass Application · ' + cat.name} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>
          <Icon name={isFree ? 'check' : 'shopping_cart'} />{isFree ? 'Submit' : 'Submit & Add to Cart'}
        </button>
      </>}>
      {coexId && (
        <div className="note" style={{ marginTop: 0 }}>
          <b className="title">On behalf of {coexById(state, coexId).company}</b>
          Payment (if any) is added to the Main Exhibitor’s cart.
        </div>
      )}
      {isFree ? (
        <div className="note green" style={{ marginTop: 0 }}>
          <b className="title">Complimentary pass available</b>
          This application will use a complimentary pass from the quota. No payment needed.
        </div>
      ) : (
        <div className="note amber" style={{ marginTop: 0 }}>
          <b className="title">Paid pass</b>
          Complimentary quota exhausted — this pass will be added to the cart for payment (6-seater {money(3500)} / 12-seater {money(5000)}).
        </div>
      )}
      <div className="form-grid">
        <Field label="Driver Name" required error={errs.name}><input type="text" value={f.name} onChange={set('name')} /></Field>
        <Field label="Driver Mobile" required error={errs.mobile}><input type="tel" value={f.mobile} onChange={set('mobile')} placeholder="10-digit mobile" /></Field>
        <Field label="Vehicle No." required error={errs.vehNo}><input type="text" value={f.vehNo} onChange={set('vehNo')} placeholder="e.g. KA 01 AB 1234" /></Field>
        <Field label="Email" required error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Driver Licence Number" required error={errs.dlNo}><input type="text" value={f.dlNo} onChange={set('dlNo')} /></Field>
        <Field label="Company Name"><input type="text" value={coexId ? coexById(state, coexId).company : EVENT.exhibitor} readOnly /></Field>
        <Field label="Upload Driving Licence" required error={errs.dlFile}>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setDlFile(e.target.files[0] || null)} />
        </Field>
        <Field label="Upload Delivery Challan Photo" required error={errs.challan}>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setChallan(e.target.files[0] || null)} />
        </Field>
        <div className="field full">
          <label>Seater Type <span className="req">*</span></label>
          <div className="radio-cards">
            <label className={'radio-card' + (seater === '6' ? ' selected' : '')} onClick={() => setSeater('6')}>
              <input type="radio" name="seater" value="6" checked={seater === '6'} readOnly />
              <b>6 Seater</b><small>{money(3500)}{isFree ? ' · complimentary for this pass' : ''}</small>
            </label>
            <label className={'radio-card' + (seater === '12' ? ' selected' : '')} onClick={() => setSeater('12')}>
              <input type="radio" name="seater" value="12" checked={seater === '12'} readOnly />
              <b>12 Seater</b><small>{money(5000)}{isFree ? ' · complimentary for this pass' : ''}</small>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

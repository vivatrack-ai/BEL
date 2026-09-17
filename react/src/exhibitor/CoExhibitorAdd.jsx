import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useExhibitorState, actions } from '../store/exhibitorStore.js';
import { EVENT, money, EMAIL_RE, scrollToFirstError } from '../lib.js';
import { Icon, Field, toast, FooterTools } from '../components/ui.jsx';

export default function CoExhibitorAdd({ isFirst }) {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const [type, setType] = useState('subsidiary');
  const [f, setF] = useState({ subCompany: '', subEmail: '', sepFirst: '', sepLast: '', sepCompany: '', sepEmail: '' });
  const [errs, setErrs] = useState({});
  if (!state) return null;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const emailInUse = (em) => state.coexhibitors.some((c) => c.email.toLowerCase() === em.toLowerCase());

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (type === 'subsidiary') {
      if (!f.subCompany.trim()) er.subCompany = 'Company name is required';
      if (!f.subEmail.trim()) er.subEmail = 'Email is required';
      else if (!EMAIL_RE.test(f.subEmail.trim())) er.subEmail = 'Enter a valid email address';
      else if (emailInUse(f.subEmail.trim())) er.subEmail = 'This email is already used by another co-exhibitor';
    } else {
      if (!f.sepFirst.trim()) er.sepFirst = 'First name is required';
      if (!f.sepLast.trim()) er.sepLast = 'Last name is required';
      if (!f.sepCompany.trim()) er.sepCompany = 'Company name is required';
      if (!f.sepEmail.trim()) er.sepEmail = 'Email is required';
      else if (!EMAIL_RE.test(f.sepEmail.trim())) er.sepEmail = 'Enter a valid email address';
      else if (emailInUse(f.sepEmail.trim())) er.sepEmail = 'This email is already used by another co-exhibitor';
    }
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }

    if (type === 'subsidiary') {
      await actions.addCoExhibitor({ type, company: f.subCompany.trim(), email: f.subEmail.trim(), nodalFirst: '', nodalLast: '' });
      toast('Subsidiary "' + f.subCompany.trim() + '" added. Login credentials & welcome email sent to ' + f.subEmail.trim(), 'success');
    } else {
      const coex = await actions.addCoExhibitor({
        type, company: f.sepCompany.trim(), email: f.sepEmail.trim(),
        nodalFirst: f.sepFirst.trim(), nodalLast: f.sepLast.trim(),
      });
      toast('Registration number ' + coex.regNo + ' generated. ' + money(EVENT.coexRegFee) + ' added to your cart.', 'success');
    }
    navigate('/exhibitor/co-exhibitors');
  };

  return (
    <>
      {!isFirst && (
        <Link className="back-link" to="/exhibitor/co-exhibitors">
          <Icon name="arrow_back" style={{ fontSize: 16 }} />Back to list
        </Link>
      )}
      <h1 className="page-title">Add New Co-Exhibitor</h1>
      <p className="page-sub">Choose the exhibitor type. Fields and rules change based on the type.</p>
      {isFirst && (
        <div className="note">
          <b className="title">No co-exhibitors added yet.</b>
          Add your first co-exhibitor below. Once added, the listing view will appear here.
        </div>
      )}
      <div className="card">
        <form onSubmit={submit} noValidate>
          <div className="field full" style={{ marginBottom: 18 }}>
            <label>Exhibitor Type <span className="req">*</span></label>
            <div className="radio-cards">
              <label className={'radio-card' + (type === 'subsidiary' ? ' selected' : '')} onClick={() => setType('subsidiary')}>
                <input type="radio" name="coexType" value="subsidiary" checked={type === 'subsidiary'} readOnly />
                <b>Subsidiary</b><small>Division of your company. Login created, no charges.</small>
              </label>
              <label className={'radio-card' + (type === 'separate' ? ' selected' : '')} onClick={() => setType('separate')}>
                <input type="radio" name="coexType" value="separate" checked={type === 'separate'} readOnly />
                <b>Separate</b><small>Independent company. Login created, {money(EVENT.coexRegFee)} registration. Gets stall space &amp; pass quotas after payment.</small>
              </label>
            </div>
          </div>

          {type === 'subsidiary' ? (
            <div>
              <div className="form-grid">
                <Field label="Subsidiary Company Name" required error={errs.subCompany}>
                  <input type="text" value={f.subCompany} onChange={set('subCompany')} placeholder="e.g. HAL Rotary Division" />
                </Field>
                <Field label="Subsidiary Company Email" required error={errs.subEmail}>
                  <input type="email" value={f.subEmail} onChange={set('subEmail')} placeholder="name@company.com" />
                </Field>
              </div>
              <div className="note amber">
                <b className="title">Note — Subsidiary Co-Exhibitor</b>
                <ul>
                  <li>Login is created for the subsidiary company (credentials sent by email on submission).</li>
                  <li>No registration charges.</li>
                  <li>This type is not allotted stall space.</li>
                  <li>Any subsidiary / division of the company will be considered part of the principal exhibitor.</li>
                  <li>This type is not entitled to any complimentary passes &amp; services.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <div className="form-grid">
                <Field label="Nodal Officer First Name" required error={errs.sepFirst}>
                  <input type="text" value={f.sepFirst} onChange={set('sepFirst')} />
                </Field>
                <Field label="Nodal Officer Last Name" required error={errs.sepLast}>
                  <input type="text" value={f.sepLast} onChange={set('sepLast')} />
                </Field>
                <Field label="Nodal Officer Company Name" required error={errs.sepCompany}>
                  <input type="text" value={f.sepCompany} onChange={set('sepCompany')} />
                </Field>
                <Field label="Nodal Officer Email" required error={errs.sepEmail}
                  hint="Login credentials & welcome email will be sent here after payment.">
                  <input type="email" value={f.sepEmail} onChange={set('sepEmail')} placeholder="name@company.com" />
                </Field>
              </div>
              <div className="note">
                <b className="title">Note — Separate Co-Exhibitor</b>
                <ul>
                  <li>Registration charges: <b>{money(EVENT.coexRegFee)} (including GST)</b>.</li>
                  <li>Payment will be added to the <b>Main Exhibitor’s cart</b>.</li>
                  <li>A unique reference / registration number is generated on submission.</li>
                  <li>A separate login is created for the co-exhibitor; credentials and a welcome email are sent after payment.</li>
                  <li>Stall space can be allocated only after the registration payment is complete.</li>
                </ul>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            {!isFirst && <Link className="btn btn-outline" to="/exhibitor/co-exhibitors">Cancel</Link>}
            <button className="btn btn-primary" type="submit"><Icon name="check" />Submit</button>
          </div>
        </form>
      </div>
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}

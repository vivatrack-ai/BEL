import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useExhibitorState, actions, acftById } from '../../store/exhibitorStore.js';
import { aircraftPrice, acftParticipant, fmtFee, YEAR_RE, EVENT, scrollToFirstError } from '../../lib.js';
import { Icon, Field, toast, FooterTools } from '../../components/ui.jsx';
import { AcftHeader, useDraft, readUpload, RateChartModal, continueWizard } from './shared.jsx';

export default function AircraftForm1() {
  const state = useExhibitorState();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const editing = state && editId ? acftById(state, editId) : null;

  const [form, setForm] = useState(() => ({
    usage: editing ? editing.usage : 'Civil',
    displayType: editing ? editing.displayType : 'Static Display',
    model: editing ? editing.model : '',
    make: editing ? editing.make : '',
    weight: editing && editing.weight != null ? String(editing.weight) : '',
    yearOfReg: editing ? editing.yearOfReg : '',
    regWithOrg: editing ? editing.regWithOrg : '',
    regNo: editing ? editing.regNo : '',
    mfgYear: editing ? editing.mfgYear : '',
  }));
  const [imgFile, setImgFile] = useState(null);
  const [errs, setErrs] = useState({});
  const [chart, setChart] = useState(false);
  const draft = useDraft('af1:' + (editId || 'new'), state ? state.acftDrafts : null, form, setForm);
  if (!state) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const part = acftParticipant();
  const fee = aircraftPrice(form.weight, form.displayType, part);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    const weight = parseFloat(form.weight);
    if (!form.model.trim()) er.model = 'Required';
    if (!form.make.trim()) er.make = 'Required';
    if (isNaN(weight) || weight <= 0) er.weight = 'Enter a valid weight in kg';
    if (!form.yearOfReg.trim()) er.yearOfReg = 'Required';
    else if (!YEAR_RE.test(form.yearOfReg.trim())) er.yearOfReg = 'Enter a valid 4-digit year (e.g. 2024)';
    if (!form.regWithOrg.trim()) er.regWithOrg = 'Required';
    if (!form.regNo.trim()) er.regNo = 'Required';
    if (!form.mfgYear.trim()) er.mfgYear = 'Required';
    else if (!YEAR_RE.test(form.mfgYear.trim())) er.mfgYear = 'Enter a valid 4-digit year (e.g. 2023)';
    if (!editing && !imgFile) er.image = 'Upload the aircraft image';
    setErrs(er);
    if (Object.keys(er).length) { scrollToFirstError(); return; }

    await draft.clear();
    const imgData = imgFile ? await readUpload(imgFile) : null;
    const payload = {
      usage: form.usage, model: form.model.trim(), make: form.make.trim(), displayType: form.displayType,
      weight, participant: part,
      yearOfReg: form.yearOfReg.trim(), regWithOrg: form.regWithOrg.trim(),
      regNo: form.regNo.trim(), mfgYear: form.mfgYear.trim(),
      price: fee ? fee.amount : null, feeCurrency: fee ? fee.currency : null,
    };

    if (editing) {
      const a = await actions.updateAircraft(editing.id, {
        ...payload,
        imageName: imgFile ? imgFile.name : editing.imageName,
        imageData: imgFile ? imgData : editing.imageData,
      });
      toast('Application ' + (a.appNo || '') + ' updated.', 'success');
      await continueWizard(a, navigate);
    } else {
      const a = await actions.createAircraft({ ...payload, imageName: imgFile.name, imageData: imgData });
      toast('Application ' + a.appNo + ' created for "' + a.model + '"' +
        (fee ? ' (fee ' + fmtFee(fee.amount, fee.currency) + ' — payable after committee approval)' : '') +
        '. Next: Aircraft Arrival Detail (Air-7A).', 'success');
      await continueWizard(a, navigate);
    }
  };

  const radio = (name, value, label, small) => (
    <label className={'radio-card' + (form[name] === value ? ' selected' : '')} onClick={() => setForm({ ...form, [name]: value })}>
      <input type="radio" checked={form[name] === value} readOnly />
      <b>{label}</b>{small && <small>{small}</small>}
    </label>
  );

  return (
    <>
      <AcftHeader active="add" draftHint={draft.hint} />
      <div className="card">
        <div className="card-head-row">
          <h2 className="card-title">{editing ? 'Edit Aircraft Detail' : 'Aircraft Detail Form'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setChart(true)}>
              <Icon name="receipt_long" style={{ fontSize: 16 }} />View Rate Chart
            </button>
            {editing && <Link className="btn btn-outline btn-sm" to="/exhibitor/aircraft">Cancel Edit</Link>}
          </div>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label>Aircraft Usage <span className="req">*</span></label>
              <div className="radio-cards">
                {radio('usage', 'Civil', 'Civil')}
                {radio('usage', 'Defence', 'Defence')}
              </div>
            </div>
            <div className="field">
              <label>Type of Display <span className="req">*</span></label>
              <div className="radio-cards">
                {radio('displayType', 'Static Display', 'Static Display', 'Fee as per tonnage rate chart')}
                {radio('displayType', 'Flying Display', 'Flying Display', 'No registration fee')}
              </div>
            </div>
            <Field label="Model of Aircraft" required error={errs.model}>
              <input type="text" value={form.model} onChange={set('model')} placeholder="e.g. Tejas Mk1A" />
            </Field>
            <Field label="Make of Aircraft" required error={errs.make}>
              <input type="text" value={form.make} onChange={set('make')} placeholder="e.g. HAL" />
            </Field>
            <Field label="Weight of Aircraft (kg)" required error={errs.weight} hint="Registration fee is calculated from the weight.">
              <input type="number" min="1" value={form.weight} onChange={set('weight')} />
            </Field>
            <Field label="Year of Registration" required error={errs.yearOfReg}>
              <input type="text" value={form.yearOfReg} onChange={set('yearOfReg')} placeholder="e.g. 2024" maxLength={4} inputMode="numeric" />
            </Field>
            <Field label="Registered With Organisation" required error={errs.regWithOrg}>
              <input type="text" value={form.regWithOrg} onChange={set('regWithOrg')} placeholder="e.g. DGCA / IAF" />
            </Field>
            <Field label="Registered No." required error={errs.regNo}>
              <input type="text" value={form.regNo} onChange={set('regNo')} placeholder="e.g. VT-XAB" />
            </Field>
            <Field label="Manufacturing Year" required error={errs.mfgYear}>
              <input type="text" value={form.mfgYear} onChange={set('mfgYear')} placeholder="e.g. 2023" maxLength={4} inputMode="numeric" />
            </Field>
            <Field label="Aircraft Image" required error={errs.image}
              hint={editing && editing.imageName ? 'Uploaded: ' + editing.imageName + ' (choose a file to replace)' : undefined}>
              <input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files[0] || null)} />
            </Field>
          </div>

          <div className="quota-strip">
            {form.displayType === 'Flying Display' ? (
              <div>Flying Display aircraft — <b>no registration fee</b> (the rate chart applies to Static Display only).</div>
            ) : fee ? (
              <div>
                Slab: <b>{fee.slabLabel}</b> · Registration Fee: <b>{fmtFee(fee.amount, fee.currency)}</b> — added to cart on submission.{' '}
                <span style={{ color: 'var(--muted)' }}>
                  ({part === 'Foreign' ? 'USD rate' : 'INR rate'} applied automatically — registered country: {EVENT.exhibitorCountry})
                </span>
              </div>
            ) : (
              <div>Enter the aircraft weight to see the registration fee (Static Display rate chart).</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <Link className="btn btn-outline" to="/exhibitor/aircraft"><Icon name="arrow_back" />Back — My Aircraft</Link>
            <button className="btn btn-primary" type="submit">
              <Icon name="arrow_forward" />{editing ? 'Update & Continue' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
      {chart && <RateChartModal onClose={() => setChart(false)} />}
      <FooterTools onReset={async () => { if (window.confirm('Reset all demo data?')) { await actions.reset(); toast('Demo data reset', 'success'); } }} />
    </>
  );
}

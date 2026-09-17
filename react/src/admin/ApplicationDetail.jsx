import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EX_COMPANY } from '../lib.js';
import { Icon, Pill, toast } from '../components/ui.jsx';
import { useAircraftApps, acFmtFee, acStatusPill, acPayPill, UploadViewerModal } from './adminShared.jsx';
import { useApprovalActions } from './AircraftApprovals.jsx';

const Val = ({ v }) => (v != null && String(v).trim() !== '' ? <>{v}</> : <span style={{ color: 'var(--muted)' }}>—</span>);

const KvGrid = ({ pairs }) => (
  <div className="form-grid" style={{ marginTop: 10 }}>
    {pairs.filter(Boolean).map(([label, value, full], i) => (
      <div key={i} className={full ? 'full' : undefined}><b>{label}:</b> <Val v={value} /></div>
    ))}
  </div>
);

const FormCard = ({ title, savedAt, children }) => (
  <div className="card section-gap" style={{ borderLeft: '3px solid var(--blue)' }}>
    <div className="card-head-row">
      <h2 className="card-title">{title}</h2>
      {savedAt && <span className="result-count">Saved: {savedAt}</span>}
    </div>
    {children}
  </div>
);

const PendingCard = ({ title }) => (
  <div className="card section-gap">
    <div className="card-head-row"><h2 className="card-title">{title}</h2><Pill color="amber">Not filled yet</Pill></div>
  </div>
);

export default function ApplicationDetail() {
  const { id } = useParams();
  const { apps, reload } = useAircraftApps();
  const { approve, reject } = useApprovalActions(reload);
  const [viewer, setViewer] = useState(null); // {name, dataUrl}
  if (!apps) return null;
  const a = apps.find((x) => x.id === id);
  if (!a) return null;

  const upload = (name, dataUrl) => {
    if (!name) return null;
    return (
      <button className="btn-link" style={{ padding: 0 }} onClick={() => {
        if (!dataUrl) {
          toast('No preview available for "' + name + '" — the file was larger than 2 MB or was uploaded before previews were enabled (ask the exhibitor to re-upload).', 'error');
          return;
        }
        setViewer({ name, dataUrl });
      }}>
        {name} <Icon name="open_in_new" style={{ fontSize: 14, verticalAlign: -2 }} />
      </button>
    );
  };

  const d7 = a.air7a, d4 = a.air4, db = a.air7b;

  return (
    <>
      <Link className="back-link" to="/admin/aircraft-approvals">
        <Icon name="arrow_back" style={{ fontSize: 16 }} />Back to Aircraft Approvals
      </Link>
      <div className="card-head-row">
        <div>
          <h1 className="page-title">{a.model} <span className="regno" style={{ fontSize: '1rem' }}>{a.appNo || ''}</span></h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            {EX_COMPANY} · {acStatusPill(a.status)} {acPayPill(a)}
            {a.submittedForApprovalAt && <> · Submitted: {a.submittedForApprovalAt}</>}
            {a.status === 'rejected' && a.remark && <> · <span style={{ color: 'var(--red)' }}>{a.remark}</span></>}
          </p>
        </div>
        {a.status === 'submitted' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => approve(a)}><Icon name="check" />Approve</button>
            <button className="btn btn-danger-soft" onClick={() => reject(a)}><Icon name="close" />Reject</button>
          </div>
        )}
      </div>

      <FormCard title="Form 1 — Aircraft Detail" savedAt={a.createdAt}>
        <KvGrid pairs={[
          ['Aircraft Usage', a.usage], ['Type of Display', a.displayType],
          ['Model of Aircraft', a.model], ['Make of Aircraft', a.make],
          ['Weight', Number(a.weight).toLocaleString('en-IN') + ' kg'],
          ['Registration Fee', a.price != null ? acFmtFee(a) : 'No fee (Flying Display)'],
          ['Year of Registration', a.yearOfReg], ['Registered With Organisation', a.regWithOrg],
          ['Registered No.', a.regNo], ['Manufacturing Year', a.mfgYear],
          ['Aircraft Image', upload(a.imageName, a.imageData) || '—'],
        ]} />
      </FormCard>

      {d7 ? (
        <FormCard title="Form 2 — Aircraft Arrival Detail (Air-7A)" savedAt={d7.savedAt}>
          <KvGrid pairs={[
            ['Aircraft Type', d7.aircraftType],
            ['Last Intermediate Landing Prior to Airbase', d7.lastLanding],
            ['Date & ETA at Airbase', d7.eta], ['Departure Date & Time', d7.departure],
            ['Airfield of Departure', d7.depAirfield], ['First Landing in India', d7.firstLanding],
          ]} />
        </FormCard>
      ) : <PendingCard title="Form 2 — Aircraft Arrival Detail (Air-7A)" />}

      {d4 ? (
        <FormCard title="Form 3 — Flying Display (Air-4)" savedAt={d4.savedAt}>
          <KvGrid pairs={[
            ['Consecutive Rolls Allowed', d4.rollsAllowed],
            ['Roll Type(s)', (d4.rollTypes || []).join(', ')],
            ['Manoeuvres Document', upload(d4.manoeuvresFile, d4.manoeuvresData) || '—'],
            ['Certificate Type', d4.certType], ['Issued By', d4.issuedBy],
            ['Stated Restrictions', d4.restrictions, true],
            ['Certificate No.', d4.certNo], ['Valid Upto', d4.validUpto],
            ['Call Sign', d4.callSign],
            ['Estimated Safe Endurance', (d4.endHrs || 0) + ' Hrs ' + (d4.endMin || 0) + ' Min'],
            ['Air Display Manoeuvres', (d4.manoeuvres || []).join(', '), true],
            ['Fine Weather — Description', d4.fineDesc, true],
            ['Fine Weather — Min Cloud Base', d4.fineBase], ['Fine Weather — Min Visibility', d4.fineVis],
            ['Bad Weather — Description', d4.badDesc, true],
            ['Bad Weather — Min Cloud Base', d4.badBase], ['Bad Weather — Min Visibility', d4.badVis],
          ]} />
        </FormCard>
      ) : <PendingCard title="Form 3 — Flying Display (Air-4)" />}

      {db ? (
        <FormCard title="Form 4 — DGCA Non-Schedule Flights (AIR 7B & 9)" savedAt={db.savedAt}>
          <KvGrid pairs={[
            ['Purpose of Flights', db.purpose, true],
            ['Over-flying / Technical Landing / Traffic', db.overfly, true],
            ['ATS Route(s)', db.atsRoutes, true],
            ['Complete Route Itinerary', db.itinerary, true],
            ['Arrival & Departure Timings in India', db.timings],
            ['Airport of Last Departure / First Landing', db.lastAirport],
            ['Type', db.type], ['State of Registry / Nationality', db.stateOfRegistry],
            ['Telephony Designator', db.telephony],
            ['Capable of Air-Dropping', db.airdrop], ['Seating Capacity > 30', db.seats30],
            ['Pay-load > 3 Tons', db.payload3t], ['ACAS-II / TCAS-II Fitted', db.acas],
            ['Noise Certificate Available', db.noiseCert],
            ['Pilot Name', db.pilotName], ['Pilot Nationality', db.pilotNat],
            ['Aircraft Operator Name', db.operatorName], ['Operator Nationality', db.operatorNat],
            ['Address (Tel/Fax)', db.address, true],
          ]} />
          <h3 style={{ margin: '18px 0 4px', fontSize: '0.95rem' }}>Onboard Details</h3>
          <KvGrid pairs={[
            ['Operator Certificate / Permit No.', db.permitNo], ['Number of Crew', db.crew],
            ['Number of Passengers', db.passengers], ['Goods Carried', db.goods],
            ['Dangerous Goods DGCA Permit', upload(db.dangerPermitFile, db.dangerPermitData) || '—'],
            ['Special Equipment DGCA Permit', upload(db.specialPermitFile, db.specialPermitData) || '—'],
            ['Passengers / Cargo Uplifted in India', db.uplift], ['Number of Crew (Uplift)', db.crew2],
            ['Address (Tel/Fax)', db.address2, true],
          ]} />
          <h3 style={{ margin: '18px 0 4px', fontSize: '0.95rem' }}>Travel / Cargo Agent in India</h3>
          <KvGrid pairs={[
            ['Name', db.agentName], ['Address (Tel/Fax)', db.agentAddr, true],
          ]} />
        </FormCard>
      ) : <PendingCard title="Form 4 — DGCA Non-Schedule Flights (AIR 7B & 9)" />}

      {viewer && <UploadViewerModal name={viewer.name} dataUrl={viewer.dataUrl} onClose={() => setViewer(null)} />}
    </>
  );
}

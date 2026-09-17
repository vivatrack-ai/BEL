import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../services/api.js';
import { money, fmtUsd } from '../lib.js';
import { Pill, toast, Modal } from '../components/ui.jsx';

/* Load admin requirements data (exhibitors + requirement rows) */
export function useAdminData() {
  const [data, setData] = useState(null);
  const reload = useCallback(async () => setData(await adminApi.getRequirements()), []);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}

/* Load aircraft applications (from the exhibitor portal / API) */
export function useAircraftApps() {
  const [apps, setApps] = useState(null);
  const reload = useCallback(async () => setApps(await adminApi.getAircraftApplications()), []);
  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }, [reload]);
  return { apps, reload };
}

export const acFmtFee = (a) => a.price == null ? '—' : (a.feeCurrency === 'USD' ? fmtUsd(a.price) : money(a.price));

export const acStatusPill = (s) => {
  const map = {
    draft: ['gray', 'Draft'], submitted: ['amber', 'Pending Approval'],
    approved: ['green', 'Approved'], registered: ['green', 'Approved'],
    rejected: ['red', 'Rejected'],
  };
  const m = map[s] || ['gray', s];
  return <Pill color={m[0]}>{m[1]}</Pill>;
};

export const acPayPill = (a) => {
  if (a.status === 'registered') return <Pill color="green">Paid</Pill>;
  if (a.status === 'approved') return a.price != null ? <Pill color="amber">Payment Pending</Pill> : <Pill color="gray">No Fee</Pill>;
  return <span style={{ color: 'var(--muted)' }}>—</span>;
};

export const AdminFooter = ({ reload }) => (
  <div className="footer-tools">
    <button onClick={async () => {
      if (!window.confirm('Reset to the original report data?')) return;
      await adminApi.reset();
      await reload();
      toast('Data reset to report', 'success');
    }}>Reset to report data</button>
  </div>
);

/* Uploaded-file viewer (image / PDF) */
export function UploadViewerModal({ name, dataUrl, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    (async () => {
      const blob = await (await fetch(dataUrl)).blob();
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [dataUrl]);
  const isImg = dataUrl.indexOf('data:image') === 0;
  return (
    <Modal wide title={'Uploaded File — ' + name} onClose={onClose}
      footer={<>
        {url && <a className="btn btn-outline" href={url} download={name}>Download</a>}
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </>}>
      {!url ? null : isImg ? (
        <div style={{ textAlign: 'center' }}>
          <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 8, border: '1px solid var(--line)' }} />
        </div>
      ) : (
        <iframe title={name} src={url} style={{ width: '100%', height: '65vh', border: '1px solid var(--line)', borderRadius: 8 }} />
      )}
    </Modal>
  );
}

/* Shared constants + formatting helpers (ported 1:1 from the vanilla build) */

export const EVENT = {
  name: 'Aero India 2027',
  dates: '10th to 15th Feb 2027',
  exhibitor: 'Hindustan Aeronautics Limited (HAL)',
  exhibitorCountry: 'India', // from the company's registration — drives INR vs USD pricing
  eventDays: ['11 Feb 2027', '12 Feb 2027', '13 Feb 2027'],
  coexRegFee: 40000,
};

export const TERMS_PDF_URL =
  'https://ancubatenew.sharepoint.com/:b:/s/BELDEF-Expo/IQA_DT5GPVXsToWxiAYzF9_4AcI8IOzD0cQN5qF2qeDvQeM?e=4rjiPj';

/* Aircraft Static Display — official tonnage rate chart */
export const STATIC_RATE_CHART = [
  { uptoTons: 1, label: 'Upto 1 ton', inr: 116000, usd: 2200 },
  { uptoTons: 3, label: 'Upto 3 tons', inr: 241000, usd: 4700 },
  { uptoTons: 10, label: 'Upto 10 tons', inr: 320000, usd: 6200 },
  { uptoTons: 25, label: 'Upto 25 tons', inr: 478000, usd: 9200 },
  { uptoTons: 40, label: 'Upto 40 tons', inr: 638000, usd: 12300 },
  { uptoTons: 60, label: 'Upto 60 tons', inr: 798000, usd: 15400 },
  { uptoTons: Infinity, label: 'Above 60 tons', inr: 814000, usd: 15700 },
];

export const ROLL_TYPES = ['Barrel', 'Aileron', 'Slow', 'Flick'];
export const MANOEUVRES = ['Gentle Manoeuvres', 'Loop', 'Steep Turns & Wing-Overs', 'Inverted Flight',
  'Barrel/Aileron/Slow/Roll(s)', 'Flick Roll(s)', 'Stall', 'Spin'];
export const COUNTRIES = ['India', 'United States', 'United Kingdom', 'France', 'Germany', 'Russia',
  'Israel', 'Brazil', 'Japan', 'Australia', 'UAE', 'Singapore', 'Other'];

export const SR_SETUP_TYPES = ['Shell', 'Raw', 'Static Display', 'Outdoor Space', 'Chalet'];
export const SR_SIDES_TYPES = ['Shell', 'Raw'];
export const SR_FLOOR_OPTS = ['1 Floor', '2 Floor'];
export const SR_SIDE_OPTS = ['One Side', 'Two Side', 'Three Side', 'Four Side'];

/* Admin · Space Requirements (report vocabulary) */
export const ADM_SETUP_TYPES = ['Shell', 'Raw', 'Pavilion', 'Outdoor', 'Chalet'];
export const ADM_SIZE_TYPES = ['Shell', 'Raw', 'Pavilion', 'Outdoor'];
export const ADM_SIDES_TYPES = ['Shell', 'Raw'];
export const ADM_FLOOR_OPTS = ['1 Floor', '2 Floor'];
export const ADM_SIDE_OPTS = ['One Side Open', 'Two Side Open', 'Three Side Open', 'Four Side Open'];
export const ADM_SIZE_BUCKETS = [
  { id: 'below100', label: 'Below 100 Sqm', test: (n) => n != null && n < 100 },
  { id: '100to200', label: '100 Sqm to 200 Sqm', test: (n) => n != null && n >= 100 && n <= 200 },
  { id: '200to400', label: '200 Sqm to 400 Sqm', test: (n) => n != null && n > 200 && n <= 400 },
  { id: '400to500', label: '400 Sqm to 500 Sqm', test: (n) => n != null && n > 400 && n <= 500 },
  { id: 'above500', label: 'Above 500 Sqm', test: (n) => n != null && n > 500 },
];
export const EX_COMPANY = 'Hindustan Aeronautics Limited (HAL)';

/* ---------------- formatting ---------------- */
export const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const fmtUsd = (n) => '$' + Number(n).toLocaleString('en-US');
export const fmtFee = (amount, currency) => (currency === 'USD' ? fmtUsd(amount) : money(amount));
export const fmtSqm = (n) => (n != null && n > 0 ? Number(n).toLocaleString('en-IN') + ' sqm' : '—');
export const nowStr = () =>
  new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MOBILE_RE = /^[6-9]\d{9}$/;
export const VEHNO_RE = /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}$/i;
export const YEAR_RE = /^(19|20)\d{2}$/;

export const acftParticipant = () => (EVENT.exhibitorCountry === 'India' ? 'Indian' : 'Foreign');

export function aircraftPrice(weightKg, displayType, participant) {
  if (displayType !== 'Static Display') return null;
  const w = Number(weightKg);
  if (isNaN(w) || w <= 0) return null;
  const tons = w / 1000;
  const slab = STATIC_RATE_CHART.find((s) => tons <= s.uptoTons);
  return {
    amount: participant === 'Foreign' ? slab.usd : slab.inr,
    currency: participant === 'Foreign' ? 'USD' : 'INR',
    slabLabel: slab.label,
  };
}

/* Scroll the first validation error into view */
export function scrollToFirstError() {
  setTimeout(() => {
    const f = document.querySelector('.field.invalid');
    if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 0);
}

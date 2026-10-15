/* ============================================================
   Shared mobile-number field: separate country dialling code
   (defaults to +91 India) + local number. Used by the exhibitor
   app (app.js), the co-exhibitor portal (coex.js) and admin
   (admin.js). Relies on the page's own $, esc, setErr, MOBILE_RE.
   Stored on a record as { nodalCc: '91', nodalMobile: '9876543210' }.
   ============================================================ */
const DEFAULT_CC = '91';
const INTL_MOBILE_RE = /^\d{6,15}$/;
const COUNTRY_CODES = [
  ['91', 'India'], ['1', 'USA / Canada'], ['44', 'United Kingdom'], ['971', 'UAE'],
  ['966', 'Saudi Arabia'], ['974', 'Qatar'], ['968', 'Oman'], ['973', 'Bahrain'], ['965', 'Kuwait'],
  ['972', 'Israel'], ['90', 'Turkey'], ['20', 'Egypt'], ['27', 'South Africa'],
  ['33', 'France'], ['49', 'Germany'], ['39', 'Italy'], ['34', 'Spain'], ['31', 'Netherlands'],
  ['32', 'Belgium'], ['46', 'Sweden'], ['47', 'Norway'], ['45', 'Denmark'], ['358', 'Finland'],
  ['41', 'Switzerland'], ['43', 'Austria'], ['48', 'Poland'], ['420', 'Czech Republic'], ['7', 'Russia'],
  ['380', 'Ukraine'], ['61', 'Australia'], ['64', 'New Zealand'], ['65', 'Singapore'], ['60', 'Malaysia'],
  ['62', 'Indonesia'], ['66', 'Thailand'], ['84', 'Vietnam'], ['63', 'Philippines'], ['81', 'Japan'],
  ['82', 'South Korea'], ['86', 'China'], ['852', 'Hong Kong'], ['886', 'Taiwan'], ['55', 'Brazil'],
  ['52', 'Mexico'], ['54', 'Argentina'], ['94', 'Sri Lanka'], ['880', 'Bangladesh'], ['977', 'Nepal'],
  ['975', 'Bhutan'], ['960', 'Maldives'], ['95', 'Myanmar'], ['92', 'Pakistan'], ['93', 'Afghanistan'],
  ['98', 'Iran'], ['964', 'Iraq'], ['962', 'Jordan'], ['254', 'Kenya'], ['234', 'Nigeria'],
];

/* Renders <div class="field"> with a country-code <select id="{prefix}Cc">
   and a tel <input id="{prefix}Mobile">. opts: { required, cc, value } */
function mobileFieldHtml(prefix, label, opts) {
  opts = opts || {};
  const cc = String(opts.cc || DEFAULT_CC);
  const options = COUNTRY_CODES.map(([code, name]) =>
    '<option value="' + code + '"' + (code === cc ? ' selected' : '') + '>+' + code + ' · ' + name + '</option>').join('');
  return '<div class="field"><label>' + label + (opts.required ? ' <span class="req">*</span>' : '') + '</label>' +
    '<div class="phone-row">' +
      '<select id="' + prefix + 'Cc" aria-label="Country code" onchange="onCcChange(\'' + prefix + '\')">' + options + '</select>' +
      '<input type="tel" id="' + prefix + 'Mobile" value="' + esc(opts.value || '') + '" placeholder="' + mobilePlaceholder(cc) + '" inputmode="numeric">' +
    '</div><div class="error"></div></div>';
}

function mobilePlaceholder(cc) { return String(cc) === DEFAULT_CC ? '10-digit mobile' : 'Mobile number (digits only)'; }

function onCcChange(prefix) {
  const sel = $(prefix + 'Cc'), inp = $(prefix + 'Mobile');
  if (sel && inp) inp.placeholder = mobilePlaceholder(sel.value);
}

/* Reads + validates the pair. Returns { cc, mobile } or null (error shown).
   +91 numbers must be 10 digits starting 6–9; other codes accept 6–15 digits. */
function readMobile(prefix, required) {
  const cc = $(prefix + 'Cc').value;
  const mobile = $(prefix + 'Mobile').value.trim().replace(/[\s\-()]/g, '');
  if (!mobile) {
    if (required) { setErr(prefix + 'Mobile', 'Mobile number is required'); return null; }
    return { cc: cc, mobile: '' };
  }
  const valid = cc === DEFAULT_CC ? MOBILE_RE.test(mobile) : INTL_MOBILE_RE.test(mobile);
  if (!valid) {
    setErr(prefix + 'Mobile', cc === DEFAULT_CC ? 'Enter a valid 10-digit Indian mobile number' : 'Enter a valid mobile number (6–15 digits, no country code)');
    return null;
  }
  return { cc: cc, mobile: mobile };
}

/* "+91 9876543210" for display / export; '' when no number stored. */
function fmtMobile(c) {
  return c && c.nodalMobile ? '+' + (c.nodalCc || DEFAULT_CC) + ' ' + c.nodalMobile : '';
}

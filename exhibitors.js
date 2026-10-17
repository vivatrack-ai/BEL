/* ============================================================
   Exhibitor portal logins (demo). Each company has its own portal
   state (localStorage key) so the domestic and the international
   flows can be tested side by side; the admin reads every portal.
   origin drives the billing currency: national → INR (Indian
   participant rates), international → USD (foreign participant rates).
   ============================================================ */

'use strict';

const SB_EXHIBITORS = [
  { id: 'hal', company: 'Hindustan Aeronautics Limited (HAL)', regNo: 'EXHC00001', country: 'India', origin: 'national',
    email: 'dhirens@evenuefy.com', lsKey: 'evenuefy_coex_module_v1', seedStalls: true, label: 'Domestic · Indian participant · billed in INR' },
  { id: 'saab', company: 'Saab AB', regNo: 'EXHC00002', country: 'Sweden', origin: 'international',
    email: 'aeroindia@saab-demo.se', lsKey: 'evenuefy_coex_module_v1_saab', seedStalls: false, label: 'International · foreign participant · billed in USD' },
  { id: 'startup', company: 'Nimbus Aerotech Private Limited', regNo: 'EXHC00003', country: 'India', origin: 'national', startup: true,
    email: 'founder@nimbus-aerotech-demo.in', lsKey: 'evenuefy_coex_module_v1_startup', seedStalls: false, label: 'Indian startup · Startup Zone pod · billed in INR' },
];
const SB_EXH_SEL_KEY = 'evenuefy_exhibitor';
function sbExhibitorById(id) { return SB_EXHIBITORS.find((p) => p.id === id) || SB_EXHIBITORS[0]; }
/* the company logged into this portal (chosen on the login screen) */
function sbCurrentExhibitor() {
  let id = null;
  try { id = localStorage.getItem(SB_EXH_SEL_KEY); } catch (e) { /* ignore */ }
  return sbExhibitorById(id);
}

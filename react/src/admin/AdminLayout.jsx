import { Outlet, NavLink, Link } from 'react-router-dom';
import { EVENT } from '../lib.js';
import { Icon } from '../components/ui.jsx';

const Item = ({ to, icon, children, disabled }) =>
  disabled ? (
    <a className="nav-item" style={{ pointerEvents: 'none', opacity: 0.5 }}>
      <Icon name={icon} />{children}
    </a>
  ) : (
    <NavLink to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
      <Icon name={icon} />{children}
    </NavLink>
  );

export default function AdminLayout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          e<span>venuefy</span>{' '}
          <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.1em' }}>ADMIN</span>
        </div>

        <Item disabled icon="home">Dashboard</Item>
        <Item disabled icon="groups">Exhibitors</Item>
        <Item disabled icon="view_comfy_alt">Space Booking</Item>

        <div className="nav-group-label">Space Requirement</div>
        <div className="nav-sub" style={{ marginLeft: 0, border: 'none', paddingLeft: 0 }}>
          <Item to="/admin/dashboard" icon="monitoring">Requirement Dashboard</Item>
          <Item to="/admin/space-requirements" icon="design_services">Space Requirements</Item>
        </div>

        <div className="nav-group-label">Aircraft</div>
        <div className="nav-sub" style={{ marginLeft: 0, border: 'none', paddingLeft: 0 }}>
          <Item to="/admin/aircraft-approvals" icon="flight">Aircraft Approvals</Item>
        </div>

        <Item disabled icon="badge">Badges</Item>
        <Item disabled icon="payments">Payments</Item>
        <Item disabled icon="settings">Settings</Item>

        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <Link className="nav-item" to="/exhibitor/co-exhibitors">
            <Icon name="open_in_new" />Exhibitor App
          </Link>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div className="event">{EVENT.name}<small>{EVENT.dates} (Asia/Kolkata)</small></div>
          <div className="spacer"></div>
          <span className="chip-user">Organiser Admin</span>
        </div>
        <div className="view"><Outlet /></div>
      </main>
    </div>
  );
}

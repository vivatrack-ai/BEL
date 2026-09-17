import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useExhibitorState, actions } from '../store/exhibitorStore.js';
import { EVENT, money, fmtUsd } from '../lib.js';
import { Icon, toast } from '../components/ui.jsx';

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

function CartDrawer({ state, onClose }) {
  const fmtItem = (i) => (i.currency === 'USD' ? fmtUsd(i.amount) : money(i.amount));
  const totalInr = state.cart.filter((i) => i.currency !== 'USD').reduce((a, i) => a + i.amount, 0);
  const totalUsd = state.cart.filter((i) => i.currency === 'USD').reduce((a, i) => a + i.amount, 0);
  const totalStr = [totalInr ? money(totalInr) : '', totalUsd ? fmtUsd(totalUsd) : ''].filter(Boolean).join(' + ') || money(0);

  const removeItem = async (item) => {
    if (item.type === 'coex_reg') {
      toast('Registration fee can’t be removed while the co-exhibitor exists. Delete the co-exhibitor instead.', 'error');
      return;
    }
    if (item.type === 'aircraft_reg') {
      toast('Registration fee can’t be removed while the aircraft exists. Delete the aircraft instead.', 'error');
      return;
    }
    await actions.removeCartItem(item.id);
    toast('Removed from cart', 'success');
  };

  const pay = async () => {
    const paidCoex = await actions.payCart();
    onClose();
    toast('Payment successful!', 'success');
    (paidCoex || []).forEach((c) =>
      setTimeout(() => toast('Welcome email with login credentials sent to ' + c.email + ' (' + c.company + ')', 'success'), 500));
  };

  return (
    <div id="cartWrap">
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <h3>Cart · Main Exhibitor</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="drawer-body">
          {state.cart.length === 0 ? (
            <div className="empty" style={{ padding: '30px 10px' }}>
              <Icon name="shopping_cart" /><h3>Cart is empty</h3>
            </div>
          ) : state.cart.map((i) => (
            <div className="cart-item" key={i.id}>
              <div><b>{i.label}</b><small>{i.sub}</small></div>
              <div style={{ textAlign: 'right' }}>
                <span className="money">{fmtItem(i)}</span><br />
                <button className="btn-link danger" onClick={() => removeItem(i)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <div className="cart-total"><span>Total (incl. GST)</span><span className="money">{totalStr}</span></div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            disabled={!state.cart.length} onClick={pay}>
            <Icon name="lock" />Pay Now
          </button>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textAlign: 'center', margin: '8px 0 0' }}>
            Demo checkout — integrate your payment gateway here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ExhibitorLayout() {
  const state = useExhibitorState();
  const [cartOpen, setCartOpen] = useState(false);
  if (!state) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">e<span>venuefy</span></div>

        <Item disabled icon="home">Dashboard</Item>
        <Item disabled icon="storefront">Manage Booth</Item>
        <Item disabled icon="event_seat">Manage Exhibition</Item>
        <Item disabled icon="shopping_cart">My Orders</Item>
        <Item disabled icon="view_comfy_alt">Space Booking</Item>
        <Item to="/exhibitor/space-requirement" icon="design_services">Space Requirement</Item>
        <Item to="/exhibitor/aircraft" icon="flight">Aircraft Registration</Item>

        <div className="nav-group-label">Co-Exhibitors</div>
        <div className="nav-sub" style={{ marginLeft: 0, border: 'none', paddingLeft: 0 }}>
          <Item to="/exhibitor/co-exhibitors" icon="group_add">Add Co-Exhibitor</Item>
          <Item to="/exhibitor/allocate-stall" icon="dashboard_customize">Allocate Stall</Item>
        </div>

        <div className="nav-group-label">Passes</div>
        <div className="nav-sub" style={{ marginLeft: 0, border: 'none', paddingLeft: 0 }}>
          <Item to="/exhibitor/passes/badges" icon="badge">Badge Details</Item>
          <Item to="/exhibitor/passes/invitee" icon="mail">Exhibitor Invitee Details</Item>
          <Item to="/exhibitor/passes/vehicle" icon="directions_car">Vehicle Pass Details</Item>
        </div>

        <Item disabled icon="meeting_room">Meeting Rooms</Item>
        <Item disabled icon="inventory_2">Products</Item>
      </aside>

      <main className="content">
        <div className="topbar">
          <div className="event">{EVENT.name}<small>{EVENT.dates} (Asia/Kolkata)</small></div>
          <div className="spacer"></div>
          <span className="chip-user">{EVENT.exhibitor}</span>
          <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
            <Icon name="shopping_cart" />
            <span className="cart-count" style={{ display: state.cart.length ? 'flex' : 'none' }}>{state.cart.length}</span>
          </button>
        </div>
        <div className="view">
          <Outlet context={{ openCart: () => setCartOpen(true) }} />
        </div>
      </main>

      {cartOpen && <CartDrawer state={state} onClose={() => setCartOpen(false)} />}
    </div>
  );
}

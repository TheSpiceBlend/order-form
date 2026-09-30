<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Orders · The Spice Blend</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<script async crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
  data-clerk-publishable-key="pk_live_Y2xlcmsudGhlc3BpY2VibGVuZC5jb20k">
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%;font-family:'Poppins',sans-serif;background:#0a1a0c;color:white;}

/* ── Top bar ── */
#topBar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:rgba(5,20,8,0.95);border-bottom:1px solid rgba(100,200,80,0.2);backdrop-filter:blur(12px);}
.top-brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
.top-brand-icon{font-size:1.4rem;}
.top-brand-name{font-family:'Noto Serif JP',serif;font-size:15px;font-weight:700;color:white;}
.top-nav{display:flex;align-items:center;gap:10px;}
.nav-btn{padding:7px 14px;border-radius:20px;font-family:'Poppins',sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.2s;border:none;}
.nav-btn-outline{background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);}
.nav-btn-outline:hover{border-color:rgba(120,200,80,0.5);color:rgba(120,200,80,0.9);}
.nav-btn-primary{background:linear-gradient(135deg,#1a6b30,#2d8a3d);color:white;box-shadow:0 2px 10px rgba(30,100,40,0.4);}
.user-chip{font-size:11px;color:rgba(255,255,255,0.45);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── Auth gate ── */
#authGate{position:fixed;inset:0;z-index:50;background:#0a1a0c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.gate-spinner{width:36px;height:36px;border:3px solid rgba(120,200,80,0.15);border-top-color:#4aaa50;border-radius:50%;animation:spin 0.8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.gate-text{font-size:13px;color:rgba(255,255,255,0.4);}

/* ── Page content ── */
#pageContent{display:none;max-width:680px;margin:0 auto;padding:24px 16px 48px;}

/* ── Page header ── */
.page-header{margin-bottom:24px;}
.page-title{font-family:'Noto Serif JP',serif;font-size:1.6rem;font-weight:700;margin-bottom:4px;}
.page-sub{font-size:12px;color:rgba(255,255,255,0.4);}

/* ── Loading / empty states ── */
#loadingState,#emptyState,#errorState{text-align:center;padding:48px 16px;}
.state-icon{font-size:3rem;margin-bottom:12px;}
.state-title{font-size:15px;font-weight:600;margin-bottom:6px;}
.state-sub{font-size:12px;color:rgba(255,255,255,0.4);line-height:1.6;}

/* ── Order card ── */
.order-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;margin-bottom:14px;transition:border-color 0.2s;}
.order-card:hover{border-color:rgba(120,200,80,0.3);}
.order-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
.order-date{font-size:11px;color:rgba(255,255,255,0.4);}
.order-id{font-size:10px;color:rgba(255,255,255,0.25);margin-top:2px;}
.order-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:0.05em;}
.badge-paid{background:rgba(30,150,60,0.2);color:#6edb80;border:1px solid rgba(60,180,80,0.3);}
.badge-pending{background:rgba(200,150,0,0.15);color:#ffcc55;border:1px solid rgba(200,150,0,0.3);}
.badge-new{background:rgba(80,120,200,0.15);color:#8ab4f8;border:1px solid rgba(80,120,200,0.3);}
.badge-cancelled{background:rgba(200,50,50,0.15);color:#ff8888;border:1px solid rgba(200,50,50,0.25);}

.order-items{margin-bottom:10px;}
.order-item-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
.order-item-row:last-child{border-bottom:none;}
.item-name{font-size:13px;font-weight:500;}
.item-qty{font-size:11px;color:rgba(255,255,255,0.4);margin-top:1px;}
.item-price{font-size:13px;color:#afffaa;font-weight:600;}

.order-footer{display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);}
.order-name{font-size:11px;color:rgba(255,255,255,0.35);}
.order-total{font-size:15px;font-weight:700;color:#7ec850;}

/* ── Order again button ── */
.order-again-btn{display:block;width:100%;margin-top:8px;padding:9px;text-align:center;background:rgba(30,100,40,0.25);border:1px solid rgba(80,180,60,0.3);border-radius:20px;color:#aee87a;font-size:12px;font-weight:500;cursor:pointer;text-decoration:none;transition:all 0.2s;}
.order-again-btn:hover{background:rgba(30,100,40,0.45);border-color:rgba(100,200,70,0.5);}

/* ── Summary strip ── */
#summaryStrip{background:rgba(10,40,15,0.7);border:1px solid rgba(100,200,80,0.15);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:none;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;}
.strip-val{font-size:1.3rem;font-weight:700;color:#7ec850;}
.strip-lbl{font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px;}
</style>
</head>
<body>

<!-- Auth gate (shown while Clerk loads) -->
<div id="authGate">
  <div class="gate-spinner"></div>
  <div class="gate-text">Loading your orders…</div>
</div>

<!-- Top bar -->
<div id="topBar" style="display:none">
  <a class="top-brand" href="/">
    <span class="top-brand-icon">🍛</span>
    <span class="top-brand-name">The Spice Blend</span>
  </a>
  <div class="top-nav">
    <span class="user-chip" id="userEmail"></span>
    <a href="/" class="nav-btn nav-btn-outline">🛒 Order</a>
    <button class="nav-btn nav-btn-outline" onclick="signOut()">Sign Out</button>
  </div>
</div>

<!-- Main content -->
<div id="pageContent">

  <div class="page-header">
    <div class="page-title">🧾 My Orders</div>
    <div class="page-sub">Your order history with The Spice Blend · Kerala Kitchen Tokyo</div>
  </div>

  <!-- Summary strip -->
  <div id="summaryStrip">
    <div><div class="strip-val" id="statOrders">—</div><div class="strip-lbl">Total Orders</div></div>
    <div><div class="strip-val" id="statSpend">—</div><div class="strip-lbl">Total Spent</div></div>
    <div><div class="strip-val" id="statLast">—</div><div class="strip-lbl">Last Order</div></div>
  </div>

  <!-- Loading -->
  <div id="loadingState">
    <div class="state-icon">⏳</div>
    <div class="state-title">Fetching your orders…</div>
    <div class="state-sub">Just a moment</div>
  </div>

  <!-- Empty -->
  <div id="emptyState" style="display:none">
    <div class="state-icon">🍽️</div>
    <div class="state-title">No orders yet</div>
    <div class="state-sub">Your Kerala feast awaits!<br>Place your first order and it will appear here.</div>
    <a href="/" style="display:inline-block;margin-top:16px;padding:10px 24px;background:linear-gradient(135deg,#1a6b30,#2d8a3d);border-radius:24px;color:white;text-decoration:none;font-size:13px;font-weight:600;">🍛 Place an Order</a>
  </div>

  <!-- Error -->
  <div id="errorState" style="display:none">
    <div class="state-icon">⚠️</div>
    <div class="state-title">Couldn't load orders</div>
    <div class="state-sub" id="errorMsg">Something went wrong. Please try again.</div>
    <button onclick="loadOrders()" style="margin-top:16px;padding:10px 24px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:24px;color:white;font-size:13px;cursor:pointer;">↺ Retry</button>
  </div>

  <!-- Orders list -->
  <div id="ordersList" style="display:none"></div>

</div>

<script>
// ── Wait for Clerk ─────────────────────────────────────────────────────────
let _clerkLoadPromise = null;
function waitForClerk() {
  if (_clerkLoadPromise) return _clerkLoadPromise;
  _clerkLoadPromise = new Promise((resolve, reject) => {
    let elapsed = 0;
    const iv = setInterval(async () => {
      elapsed += 50;
      if (window.Clerk) {
        clearInterval(iv);
        try { await window.Clerk.load(); resolve(window.Clerk); }
        catch(e) { reject(e); }
      } else if (elapsed > 10000) {
        clearInterval(iv);
        reject(new Error('Auth service unavailable'));
      }
    }, 50);
  });
  return _clerkLoadPromise;
}

// ── Init ───────────────────────────────────────────────────────────────────
waitForClerk().then(async clerk => {
  if (!clerk.user) {
    window.location.href = '/login';
    return;
  }
  // Show UI
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('topBar').style.display = 'flex';
  document.getElementById('pageContent').style.display = 'block';
  document.getElementById('userEmail').textContent = clerk.user.primaryEmailAddress?.emailAddress || '';
  loadOrders();
}).catch(() => {
  window.location.href = '/login';
});

// ── Sign out ───────────────────────────────────────────────────────────────
async function signOut() {
  const clerk = await waitForClerk();
  await clerk.signOut();
  window.location.href = '/login';
}

// ── Load orders ────────────────────────────────────────────────────────────
async function loadOrders() {
  show('loadingState');
  try {
    const clerk = await waitForClerk();
    // Get Clerk session token for API auth
    const token = await clerk.session.getToken();
    const res = await fetch('/api/my-orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error || 'API error') + (data.detail ? ': ' + data.detail : ''));
    renderOrders(data.orders || []);
  } catch(e) {
    show('errorState');
    document.getElementById('errorMsg').textContent = e.message || 'Something went wrong.';
  }
}

// ── Render orders ──────────────────────────────────────────────────────────
function renderOrders(orders) {
  if (orders.length === 0) { show('emptyState'); return; }

  // Summary strip
  let totalSpend = 0;
  orders.forEach(o => {
    const t = parseFloat((o.total || o['total (¥)'] || '').replace(/[^0-9.]/g, '')) || 0;
    totalSpend += t;
  });
  const lastDate = formatDate(orders[0].date || orders[0].timestamp || '');
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statSpend').textContent = '¥' + totalSpend.toLocaleString();
  document.getElementById('statLast').textContent = lastDate || '—';
  document.getElementById('summaryStrip').style.display = 'grid';

  const list = document.getElementById('ordersList');
  list.innerHTML = orders.map(o => orderCard(o)).join('');
  show('ordersList');
}

function orderCard(o) {
  // Try to find common field names (the sheet columns vary)
  const date      = o.date || o.timestamp || o['order date'] || '';
  const name      = o.name || o['customer name'] || o['full name'] || '';
  const items     = o.items || o['item'] || o['items ordered'] || o.order || '';
  const total     = o.total || o['total (¥)'] || o['amount'] || '';
  const status    = o.status || o['payment status'] || o['paid'] || '';
  const notes     = o.notes || o.note || o['special requests'] || '';
  const qty       = o.qty || o.quantity || o['# boxes'] || '';

  const badge     = statusBadge(status);
  const dateStr   = formatDate(date);

  // Build item rows — items field may be a comma list or single item
  const itemList  = items ? items.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : [];
  const itemsHtml = itemList.length > 0
    ? itemList.map(item => `
        <div class="order-item-row">
          <div>
            <div class="item-name">${esc(item)}</div>
            ${qty ? `<div class="item-qty">Qty: ${esc(qty)}</div>` : ''}
          </div>
          ${total && itemList.length === 1 ? `<div class="item-price">${esc(total)}</div>` : ''}
        </div>`).join('')
    : `<div class="order-item-row"><div class="item-name" style="color:rgba(255,255,255,0.4)">—</div></div>`;

  return `
    <div class="order-card">
      <div class="order-top">
        <div>
          <div class="order-date">${dateStr || 'Date unknown'}</div>
          ${notes ? `<div class="order-id">📝 ${esc(notes)}</div>` : ''}
        </div>
        <span class="order-badge ${badge.cls}">${badge.label}</span>
      </div>
      <div class="order-items">${itemsHtml}</div>
      <div class="order-footer">
        <div class="order-name">${name ? '👤 ' + esc(name) : ''}</div>
        <div class="order-total">${total ? esc(total) : ''}</div>
      </div>
      <a href="/" class="order-again-btn">🍛 Order again</a>
    </div>`;
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('paid') || s.includes('yes') || s === 'true')
    return { cls: 'badge-paid', label: '✅ Paid' };
  if (s.includes('cancel'))
    return { cls: 'badge-cancelled', label: '✗ Cancelled' };
  if (s.includes('pend') || s.includes('wait'))
    return { cls: 'badge-pending', label: '⏳ Pending' };
  return { cls: 'badge-new', label: '🆕 New' };
}

function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return raw; // return as-is if can't parse
  return d.toLocaleDateString('en-JP', { year:'numeric', month:'short', day:'numeric' });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function show(id) {
  ['loadingState','emptyState','errorState','ordersList'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.style.display = (i === id ? (i === 'ordersList' ? 'block' : 'block') : 'none');
  });
}
</script>
</body>
</html>

/* =====================================================================
   ORDER.JS — Trang đặt hàng khách
   ===================================================================== */
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, set, get, remove }
                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBIYL4PSLHpzJwfEl4bJkyRz364sSvntCk",
  authDomain:        "mhx2026-gayquy.firebaseapp.com",
  databaseURL:       "https://mhx2026-gayquy-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "mhx2026-gayquy",
  storageBucket:     "mhx2026-gayquy.firebasestorage.app",
  messagingSenderId: "699589001388",
  appId:             "1:699589001388:web:71ec17fa4e978980be9f09",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* ─── STATE ──────────────────────────────────────────────────────── */
let products  = [];
let cart      = {}; // { productId: { ...product, qty } }
let settings  = {};
let goal      = 0;
let totalRevenue = 0;
let currentOrderId = null;
let autoHuỷTimer   = null;

/* ─── UTILS ──────────────────────────────────────────────────────── */
const fmt   = n => n.toLocaleString('vi-VN') + 'đ';
const today = () => new Date().toISOString().slice(0,10);
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7).toUpperCase();

let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('oToast');
  el.textContent = msg; el.className = 'o-toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = 'o-toast', 3000);
}

function getCatEmoji(cat) {
  return {'Đồ uống':'🥤','Đồ ăn':'🍱','Bánh':'🧁','Khác':'🎁'}[cat] || '📦';
}

/* ─── LOAD SETTINGS ─────────────────────────────────────────────── */
onValue(ref(db, 'settings'), snap => {
  settings = snap.val() || {};
  applySettings();
});

function applySettings() {
  // Giờ hoạt động
  const open  = settings.openHour  ?? 8;
  const close = settings.closeHour ?? 17;
  document.getElementById('infoHours').textContent   = `${open}:00 – ${close}:00`;
  document.getElementById('workHours').textContent   = `${open}:00 – ${close}:00`;

  // Kiểm tra giờ hiện tại
  const now  = new Date();
  const day  = now.getDay(); // 0=CN, 6=T7
  const hour = now.getHours();
  const isOpen = day >= 1 && day <= 5 && hour >= open && hour < close;
  const badge  = document.getElementById('statusBadge');
  document.getElementById('statusText').textContent = isOpen ? 'Đang mở' : 'Ngoài giờ';
  badge.classList.toggle('closed', !isOpen);
  document.getElementById('outsideHoursBanner').style.display = isOpen ? 'none' : 'block';

  // Bảng phí ship
  renderShipFeeTable();

  // Thông tin chuyển khoản
  if (settings.bankName)    document.getElementById('bankName').textContent    = settings.bankName;
  if (settings.bankAccount) document.getElementById('bankAccount').textContent = settings.bankAccount;
  if (settings.bankOwner)   document.getElementById('bankOwner').textContent   = settings.bankOwner;
  if (settings.transferQR) {
    const qrImg = document.getElementById('transferQR');
    qrImg.src = settings.transferQR;
    qrImg.style.display = 'block';
    document.getElementById('qrPlaceholder').style.display = 'none';
  }

  // SĐT liên hệ
  if (settings.contactPhone) {
    document.getElementById('contactPhoneVal').textContent = settings.contactPhone;
    document.getElementById('contactPhone').href = 'tel:' + settings.contactPhone;
    document.getElementById('order-disclaimer').innerHTML =
      `Sau khi đặt, bạn có thể huỷ đơn nếu chưa được xác nhận. Khi đơn đã xác nhận, vui lòng liên hệ <strong>${settings.contactPhone}</strong> để thay đổi.`;
  }

  // Hero banner
  if (settings.heroBanner) {
    const img = document.getElementById('heroBanner');
    img.src = settings.heroBanner;
    img.style.display = 'block';
  }
  if (settings.programName)  document.getElementById('heroTitle').innerHTML  = settings.programName.replace('\n','<br/>');
  if (settings.programDesc)  document.getElementById('heroDesc').textContent  = settings.programDesc;
  if (settings.brandName)    document.getElementById('headerBrand').textContent = settings.brandName;
  if (settings.brandSub)     document.getElementById('headerSub').textContent   = settings.brandSub;

  // Set default delivery time
  const dt = document.getElementById('deliveryTime');
  if (!dt.value) {
    const def = new Date(); def.setHours(def.getHours() + 2); def.setMinutes(0);
    dt.value = def.toISOString().slice(0,16);
    dt.min   = new Date().toISOString().slice(0,16);
  }
}

function renderShipFeeTable() {
  const fees = settings.shipFees || [
    { label: '0 – 2 km', key: '0-2', price: 10000 },
    { label: '2 – 5 km', key: '2-5', price: 20000 },
    { label: 'Trên 5 km', key: '5+', price: 30000 },
  ];
  document.getElementById('shipFeeTable').innerHTML = fees.map(f => `
    <div class="ship-fee-row">
      <span>${f.label}</span>
      <span class="ship-fee-amt">${fmt(f.price)}</span>
    </div>`).join('');
}

/* ─── LOAD PRODUCTS ─────────────────────────────────────────────── */
onValue(ref(db, 'products'), snap => {
  products = [];
  snap.forEach(c => products.push({ id: c.key, ...c.val() }));
  renderMenu();
  renderCatPills();
});

function renderCatPills() {
  const cats = ['Tất cả', ...new Set(products.map(p => p.category))];
  document.getElementById('catPills').innerHTML = cats.map((c,i) => `
    <button class="cat-pill ${i===0?'active':''}" data-cat="${i===0?'':c}">${c}</button>`
  ).join('');
  document.querySelectorAll('.cat-pill').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMenu(btn.dataset.cat);
    })
  );
}

function renderMenu(filterCat = '') {
  const list = filterCat ? products.filter(p => p.category === filterCat) : products;
  const grid = document.getElementById('menuGrid');
  if (!list.length) {
    grid.innerHTML = `<div class="menu-loading">Chưa có sản phẩm nào 🛒</div>`; return;
  }
  grid.innerHTML = list.map(p => {
    const qty = cart[p.id]?.qty || 0;
    return `
    <div class="menu-card" id="mcard-${p.id}">
      <div class="menu-card-img-wrap">
        ${p.image
          ? `<img class="menu-card-img" src="${p.image}" alt="${p.name}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/>
             <div class="menu-card-placeholder" style="display:none">${getCatEmoji(p.category)}</div>`
          : `<div class="menu-card-placeholder">${getCatEmoji(p.category)}</div>`}
        <div class="menu-card-badge">${p.category}</div>
      </div>
      <div class="menu-card-body">
        <div class="menu-card-name">${p.name}</div>
        <div class="menu-card-price">${p.price.toLocaleString('vi-VN')}<span> đ</span></div>
        <div class="menu-card-actions">
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeQty('${p.id}',-1)">−</button>
            <span class="qty-val" id="qty-${p.id}">${qty}</span>
            <button class="qty-btn" onclick="changeQty('${p.id}',1)">+</button>
          </div>
          <button class="btn-add-to-cart ${qty>0?'in-cart':''}" onclick="addToCart('${p.id}')" id="btn-${p.id}">
            ${qty > 0 ? '✓ Đã thêm' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ─── CART ───────────────────────────────────────────────────────── */
window.changeQty = (id, delta) => {
  const p   = products.find(x => x.id === id);
  if (!p) return;
  const cur = cart[id]?.qty || 0;
  const nxt = Math.max(0, cur + delta);
  if (nxt === 0) { delete cart[id]; }
  else { cart[id] = { ...p, qty: nxt }; }
  updateQtyDisplay(id, nxt);
  updateCartUI();
};

window.addToCart = (id) => {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!cart[id]) { cart[id] = { ...p, qty: 1 }; }
  else { cart[id].qty++; }
  updateQtyDisplay(id, cart[id].qty);
  updateCartUI();
  toast(`Đã thêm ${p.name} vào giỏ!`, 'success');
};

function updateQtyDisplay(id, qty) {
  const qtyEl = document.getElementById(`qty-${id}`);
  const btnEl = document.getElementById(`btn-${id}`);
  if (qtyEl) qtyEl.textContent = qty;
  if (btnEl) { btnEl.className = `btn-add-to-cart ${qty>0?'in-cart':''}`; btnEl.textContent = qty>0?'✓ Đã thêm':'Thêm'; }
}

function getShipFee(distKey) {
  const fees = settings.shipFees || [
    { key:'0-2', price:10000 },{ key:'2-5', price:20000 },{ key:'5+', price:30000 },
  ];
  return fees.find(f => f.key === distKey)?.price ?? 0;
}

function updateCartUI() {
  const items  = Object.values(cart);
  const count  = items.reduce((s,i) => s+i.qty, 0);
  const subtotal = items.reduce((s,i) => s+i.qty*i.price, 0);
  const distKey  = document.getElementById('distanceSelect').value;
  const shipFee  = distKey ? getShipFee(distKey) : 0;
  const grand    = subtotal + shipFee;

  // Cart bar
  const cartBar = document.getElementById('cartBar');
  cartBar.style.display = count > 0 ? 'block' : 'none';
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = fmt(grand);

  // Cart items list
  const cartItemsEl = document.getElementById('cartItems');
  const cartSummary  = document.getElementById('cartSummary');
  if (!items.length) {
    cartItemsEl.innerHTML = `<div class="cart-empty">Chưa chọn món nào. <a href="#menu-section">Xem thực đơn →</a></div>`;
    cartSummary.style.display = 'none';
  } else {
    cartItemsEl.innerHTML = items.map(i => `
      <div class="cart-item">
        <div class="cart-item-img">${i.image ? `<img src="${i.image}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>` : getCatEmoji(i.category)}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${fmt(i.price)} / món</div>
        </div>
        <div class="cart-item-qty">
          <button class="cqty-btn" onclick="changeQty('${i.id}',-1)">−</button>
          <span class="cqty-val">${i.qty}</span>
          <button class="cqty-btn" onclick="changeQty('${i.id}',1)">+</button>
        </div>
        <div class="cart-item-total">${fmt(i.qty*i.price)}</div>
      </div>`).join('');
    cartSummary.style.display = 'block';
    document.getElementById('subtotalAmt').textContent = fmt(subtotal);
    document.getElementById('shipFeeAmt').textContent  = distKey ? fmt(shipFee) : '— (chọn khoảng cách)';
    document.getElementById('grandTotal').textContent  = fmt(grand);
  }

  // Submit button
  const btn = document.getElementById('submitOrderBtn');
  const txt = document.getElementById('submitBtnText');
  if (!items.length) { btn.disabled=true; txt.textContent='Chọn món để đặt hàng'; }
  else if (!distKey) { btn.disabled=true; txt.textContent='Chọn khoảng cách giao hàng'; }
  else               { btn.disabled=false; txt.textContent=`Đặt hàng — ${fmt(grand)}`; }
}

// Phí ship hint
document.getElementById('distanceSelect').addEventListener('change', () => {
  const key = document.getElementById('distanceSelect').value;
  const fee = key ? getShipFee(key) : 0;
  document.getElementById('shipFeeHint').textContent = key ? `Phí ship: ${fmt(fee)}` : 'Chọn khoảng cách để tính phí ship';
  updateCartUI();
});

// Cart bar scroll to form
document.getElementById('openCartBtn').addEventListener('click', () =>
  document.getElementById('order-form').scrollIntoView({ behavior:'smooth' })
);

// Payment toggle
document.querySelectorAll('input[name="payment"]').forEach(radio =>
  radio.addEventListener('change', () => {
    document.getElementById('transferInfo').style.display =
      radio.value === 'transfer' ? 'block' : 'none';
  })
);

/* ─── SUBMIT ORDER ───────────────────────────────────────────────── */
document.getElementById('submitOrderBtn').addEventListener('click', async () => {
  const name     = document.getElementById('custName').value.trim();
  const phone    = document.getElementById('custPhone').value.trim();
  const address  = document.getElementById('custAddress').value.trim();
  const distKey  = document.getElementById('distanceSelect').value;
  const delTime  = document.getElementById('deliveryTime').value;
  const note     = document.getElementById('custNote').value.trim();
  const payment  = document.querySelector('input[name="payment"]:checked').value;
  const items    = Object.values(cart);

  if (!name)    return toast('Vui lòng nhập họ tên', 'error');
  if (!phone)   return toast('Vui lòng nhập số điện thoại', 'error');
  if (!address) return toast('Vui lòng nhập địa chỉ giao hàng', 'error');
  if (!distKey) return toast('Vui lòng chọn khoảng cách', 'error');
  if (!delTime) return toast('Vui lòng chọn thời gian nhận hàng', 'error');
  if (!items.length) return toast('Chưa có món nào trong giỏ', 'error');

  const subtotal = items.reduce((s,i) => s+i.qty*i.price, 0);
  const shipFee  = getShipFee(distKey);
  const total    = subtotal + shipFee;
  const orderId  = 'MHX-' + uid();

  const order = {
    orderId, status: 'new',
    customer: { name, phone, address, distKey, deliveryTime: delTime, note },
    items: items.map(i => ({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
    subtotal, shipFee, total, payment,
    createdAt: Date.now(),
    statusHistory: [{ status:'new', time: Date.now(), note:'Khách đặt hàng' }],
  };

  try {
    document.getElementById('submitBtnText').textContent = 'Đang gửi đơn...';
    document.getElementById('submitOrderBtn').disabled = true;
    const newRef = await push(ref(db, 'orders'), order);
    currentOrderId = newRef.key;
    // Lưu orderId vào localStorage để theo dõi
    localStorage.setItem('mhx_order_id', currentOrderId);
    showOrderStatus(currentOrderId);
    // Reset cart
    cart = {};
    updateCartUI();
    renderMenu(document.querySelector('.cat-pill.active')?.dataset.cat || '');
  } catch(e) {
    toast('Lỗi gửi đơn: ' + e.message, 'error');
    document.getElementById('submitBtnText').textContent = `Đặt hàng — ${fmt(total)}`;
    document.getElementById('submitOrderBtn').disabled = false;
  }
});

/* ─── THEO DÕI TRẠNG THÁI ĐƠN ───────────────────────────────────── */
function showOrderStatus(fbKey) {
  document.getElementById('orderStatusOverlay').style.display = 'flex';
  document.getElementById('orderIdDisplay').textContent = fbKey.slice(-8).toUpperCase();

  onValue(ref(db, 'orders/' + fbKey), snap => {
    if (!snap.exists()) return;
    const order = snap.val();
    updateTracker(order.status);

    const cancelBtn = document.getElementById('cancelOrderBtn');
    cancelBtn.style.display = order.status === 'new' ? 'block' : 'none';

    // Message theo trạng thái
    const msgs = {
      new:       '⏳ Đơn hàng của bạn đang chờ nhân sự xác nhận. Vui lòng chờ trong giây lát!',
      confirmed: '✅ Đơn hàng đã được xác nhận! Chúng tôi sẽ chuẩn bị và giao đến bạn đúng hẹn.',
      shipping:  '🛵 Đơn hàng đang trên đường giao đến bạn. Hãy chú ý điện thoại!',
      done:      '🎉 Giao hàng thành công! Cảm ơn bạn đã ủng hộ chương trình MHX 2026 💚',
      cancelled: '❌ Đơn hàng đã bị huỷ.',
      failed:    '😔 Giao hàng không thành công. Nhân sự sẽ liên hệ lại với bạn.',
    };
    document.getElementById('statusMessage').textContent = msgs[order.status] || '';

    // Status icon
    const icons = { new:'⏳', confirmed:'✅', shipping:'🛵', done:'🎉', cancelled:'❌', failed:'😔' };
    document.getElementById('statusIcon').textContent = icons[order.status] || '📦';

    // Auto huỷ sau 1 tiếng nếu vẫn là 'new'
    if (order.status === 'new') {
      clearTimeout(autoHuỷTimer);
      const elapsed = Date.now() - (order.createdAt || Date.now());
      const remain  = 3600000 - elapsed;
      if (remain > 0) {
        autoHuỷTimer = setTimeout(async () => {
          await set(ref(db, 'orders/' + fbKey + '/status'), 'cancelled');
          await push(ref(db, 'orders/' + fbKey + '/statusHistory'), { status:'cancelled', time:Date.now(), note:'Tự động huỷ sau 1 tiếng không xác nhận' });
        }, remain);
      }
    }
  });
}

function updateTracker(status) {
  const steps   = ['new','confirmed','shipping','done'];
  const stepIds = ['step-new','step-confirmed','step-shipping','step-done'];
  const lines   = document.querySelectorAll('.tracker-line');
  const idx     = steps.indexOf(status);
  stepIds.forEach((id,i) => {
    const el = document.getElementById(id);
    el.classList.remove('active','done');
    if (i < idx)  el.classList.add('done');
    if (i === idx) el.classList.add('active');
  });
  lines.forEach((l,i) => l.classList.toggle('done', i < idx));
}

// Huỷ đơn
document.getElementById('cancelOrderBtn').addEventListener('click', async () => {
  if (!currentOrderId) return;
  if (!confirm('Bạn có chắc muốn huỷ đơn hàng này?')) return;
  await set(ref(db, 'orders/' + currentOrderId + '/status'), 'cancelled');
  await push(ref(db, 'orders/' + currentOrderId + '/statusHistory'), { status:'cancelled', time:Date.now(), note:'Khách huỷ đơn' });
  toast('Đã huỷ đơn hàng', '');
});

// Đặt đơn mới
document.getElementById('newOrderBtn').addEventListener('click', () => {
  currentOrderId = null;
  localStorage.removeItem('mhx_order_id');
  clearTimeout(autoHuỷTimer);
  document.getElementById('orderStatusOverlay').style.display = 'none';
  document.getElementById('custName').value    = '';
  document.getElementById('custPhone').value   = '';
  document.getElementById('custAddress').value = '';
  document.getElementById('custNote').value    = '';
  window.scrollTo({ top:0, behavior:'smooth' });
});

/* ─── HERO STATS ─────────────────────────────────────────────────── */
onValue(ref(db, 'orders'), snap => {
  let count = 0, revenue = 0;
  snap.forEach(c => {
    const o = c.val();
    if (o.status === 'done') { count++; revenue += o.total||0; }
  });
  totalRevenue = revenue;
  document.getElementById('heroOrders').textContent  = count;
  document.getElementById('heroRevenue').textContent = revenue >= 1e6 ? (revenue/1e6).toFixed(1)+'M đ' : revenue.toLocaleString('vi-VN')+'đ';
  if (goal > 0) {
    const pct = Math.min(100, Math.round(revenue/goal*100));
    document.getElementById('heroGoalPct').textContent = pct + '%';
    document.getElementById('missionBar').style.width  = pct + '%';
    document.getElementById('missionPct').textContent  = pct + '% mục tiêu';
  }
});

onValue(ref(db, 'goal'), snap => {
  goal = snap.val() || 0;
});

/* ─── KHÔI PHỤC ĐƠN CŨ KHI RELOAD ──────────────────────────────── */
const savedOrder = localStorage.getItem('mhx_order_id');
if (savedOrder) {
  get(ref(db, 'orders/' + savedOrder)).then(snap => {
    if (snap.exists() && !['done','cancelled','failed'].includes(snap.val().status)) {
      currentOrderId = savedOrder;
      showOrderStatus(savedOrder);
    } else {
      localStorage.removeItem('mhx_order_id');
    }
  });
}

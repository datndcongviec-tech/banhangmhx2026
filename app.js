/* =====================================================================
   FUNDRAISER SALES MANAGER — app.js  (Firebase Realtime DB + Google Auth)
   =====================================================================
   ▶ BƯỚC SETUP BẮT BUỘC:
     1. Vào https://console.firebase.google.com → tạo project mới
     2. Thêm Web App → copy firebaseConfig bên dưới
     3. Bật Authentication → Sign-in method → Google
     4. Bật Realtime Database → tạo DB → Rules: xem README
   ===================================================================== */

import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, push, set, remove, onValue, get }
                             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ─── 🔧 FIREBASE CONFIG — ĐIỀN VÀO ĐÂY ─────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyBIYL4PSLHpzJwfEl4bJkyRz364sSvntCk",
  authDomain:        "mhx2026-gayquy.firebaseapp.com",
  databaseURL:       "https://mhx2026-gayquy-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "mhx2026-gayquy",
  storageBucket:     "mhx2026-gayquy.firebasestorage.app",
  messagingSenderId: "699589001388",
  appId:             "1:699589001388:web:71ec17fa4e978980be9f09",
};
/* ─────────────────────────────────────────────────────────────────── */

// Detect unconfigured state
const IS_CONFIGURED = !Object.values(firebaseConfig).some(v => v.includes("PASTE_"));

let app, auth, db, currentUser = null;
let salesCache = [], productsCache = [], goalCache = 0;

if (IS_CONFIGURED) {
  app  = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db   = getDatabase(app);
} else {
  document.getElementById('setupWarn').style.display = 'block';
}

/* ─── UTILS ──────────────────────────────────────────────────────── */
const fmt      = n => n.toLocaleString('vi-VN') + 'đ';
const fmtShort = n => n >= 1e6 ? (n/1e6).toFixed(1)+'Mđ' : n >= 1e3 ? (n/1e3).toFixed(0)+'Kđ' : fmt(n);
const today    = () => new Date().toISOString().slice(0,10);
const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3000);
}

/* ─── AUTH & NAME VERIFICATION ───────────────────────────────────── */
let verifiedName = null; // tên thành viên đã xác nhận

// Bước 1: Đăng nhập Google
document.getElementById('loginBtn').addEventListener('click', async () => {
  if (!IS_CONFIGURED) return showToast('Chưa cấu hình Firebase. Xem hướng dẫn trong app.js', 'error');
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch(e) {
    showToast('Đăng nhập thất bại: ' + e.message, 'error');
  }
});

// Bước 2: Sau khi đăng nhập Google → hiện màn hình nhập tên
if (IS_CONFIGURED) {
  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
      // Nếu đã verify tên rồi thì vào thẳng app
      if (verifiedName) {
        enterApp(verifiedName);
        return;
      }
      // Hiện màn hình nhập tên
      document.getElementById('loginScreen').style.display  = 'none';
      document.getElementById('verifyScreen').style.display = 'flex';
      document.getElementById('verifyGreet').innerHTML =
        `Đã đăng nhập: <strong>${user.email}</strong><br/>Nhập tên thành viên của bạn trong team để xác nhận.`;
      document.getElementById('verifyNameInput').focus();
    } else {
      verifiedName = null;
      document.getElementById('loginScreen').style.display  = 'flex';
      document.getElementById('verifyScreen').style.display = 'none';
      document.getElementById('appShell').style.display     = 'none';
    }
  });
}

// Bước 3: Xác nhận tên — check với danh sách allowed_users trong Firebase
async function verifyName() {
  const input = document.getElementById('verifyNameInput').value.trim();
  if (!input) return showToast('Vui lòng nhập tên của bạn', 'error');

  const errEl  = document.getElementById('verifyError');
  const btn    = document.getElementById('verifyBtn');
  btn.textContent = 'Đang kiểm tra...';
  btn.disabled = true;
  errEl.style.display = 'none';

  try {
    const snap = await get(ref(db, 'allowed_users/' + input));
    if (snap.exists() && snap.val() === true) {
      // Tên hợp lệ → vào app
      verifiedName = input;
      document.getElementById('verifyScreen').style.display = 'none';
      enterApp(input);
    } else {
      // Tên không có trong danh sách
      errEl.style.display = 'block';
      btn.textContent = 'Xác nhận →';
      btn.disabled = false;
    }
  } catch(e) {
    showToast('Lỗi kết nối: ' + e.message, 'error');
    btn.textContent = 'Xác nhận →';
    btn.disabled = false;
  }
}

document.getElementById('verifyBtn').addEventListener('click', verifyName);
document.getElementById('verifyNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') verifyName();
});
document.getElementById('verifyLogoutBtn').addEventListener('click', async () => {
  await signOut(auth);
});

// Vào app sau khi xác nhận tên
function enterApp(name) {
  document.getElementById('appShell').style.display    = 'block';
  document.getElementById('userName').textContent      = name;
  document.getElementById('userEmail').textContent     = currentUser?.email || '—';
  document.getElementById('userAvatar').src            = currentUser?.photoURL || '';
  document.getElementById('salePerson').value          = name;
  initFirebaseListeners();
  initUI();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (confirm('Đăng xuất?')) { verifiedName = null; await signOut(auth); }
});

/* ─── FIREBASE LISTENERS (realtime) ──────────────────────────────── */
function initFirebaseListeners() {
  // Sales — live
  onValue(ref(db, 'sales'), snap => {
    salesCache = [];
    snap.forEach(child => salesCache.push({ id: child.key, ...child.val() }));
    renderCurrentPage();
    updateGoalUI();
  });

  // Products — live
  onValue(ref(db, 'products'), snap => {
    productsCache = [];
    snap.forEach(child => productsCache.push({ id: child.key, ...child.val() }));
    if (document.getElementById('page-products').classList.contains('active')) renderProducts();
  });

  // Goal — live
  onValue(ref(db, 'goal'), snap => {
    goalCache = snap.val() || 0;
    updateGoalUI();
  });

  // Connectivity indicator
  onValue(ref(db, '.info/connected'), snap => {
    const dot = document.getElementById('realtimeDot');
    dot.classList.toggle('offline', !snap.val());
    dot.title = snap.val() ? 'Đang kết nối realtime' : 'Mất kết nối';
  });
}

/* ─── NAVIGATION ─────────────────────────────────────────────────── */
const pageTitles = {
  dashboard: 'Tổng Quan', sales: 'Nhập Đơn Hàng',
  products: 'Sản Phẩm & Giá', history: 'Lịch Sử Bán Hàng', report: 'Báo Cáo & Xuất File'
};

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelector(`.nav-item[data-page="${pageId}"]`).classList.add('active');
  document.getElementById('topbarTitle').textContent = pageTitles[pageId];
  if (window.innerWidth < 700) document.getElementById('sidebar').classList.remove('open');
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'history')   renderHistory();
  if (pageId === 'products')  renderProducts();
  if (pageId === 'report')    renderReport();
}

function renderCurrentPage() {
  const active = document.querySelector('.page.active');
  if (!active) return;
  const pageId = active.id.replace('page-', '');
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'history')   renderHistory();
  if (pageId === 'report')    renderReport();
}

document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); })
);
document.getElementById('menuToggle').addEventListener('click', () =>
  document.getElementById('sidebar').classList.toggle('open')
);

/* ─── GOAL ────────────────────────────────────────────────────────── */
function updateGoalUI() {
  const total = salesCache.reduce((s,c) => s + (c.total||0), 0);
  const pct   = goalCache > 0 ? Math.min(100, total/goalCache*100) : 0;
  document.getElementById('goalBar').style.width        = pct + '%';
  document.getElementById('goalCurrent').textContent    = fmtShort(total);
  document.getElementById('goalTarget').textContent     = '/ ' + (goalCache > 0 ? fmtShort(goalCache) : 'Chưa đặt');
}

document.getElementById('openGoalModal').addEventListener('click', () => {
  document.getElementById('goalInput').value = goalCache || '';
  document.getElementById('goalModal').classList.add('open');
});
document.getElementById('closeGoalModal').addEventListener('click', () =>
  document.getElementById('goalModal').classList.remove('open')
);
document.getElementById('saveGoalBtn').addEventListener('click', async () => {
  const v = parseFloat(document.getElementById('goalInput').value);
  if (isNaN(v) || v < 0) return showToast('Vui lòng nhập số hợp lệ', 'error');
  await set(ref(db, 'goal'), v);
  document.getElementById('goalModal').classList.remove('open');
  showToast('Đã lưu mục tiêu!', 'success');
});

/* ─── DASHBOARD ───────────────────────────────────────────────────── */
let chartDaily = null, chartProd = null;

function renderDashboard() {
  const sales    = salesCache;
  const total    = sales.reduce((s,c) => s + (c.total||0), 0);
  const todayStr = today();
  const todayAmt = sales.filter(s => s.date === todayStr).reduce((s,c) => s + (c.total||0), 0);
  const days     = [...new Set(sales.map(s => s.date))].length;
  const avg      = sales.length > 0 ? Math.round(total / sales.length) : 0;

  document.getElementById('statTotal').textContent      = fmt(total);
  document.getElementById('statTotalDelta').textContent = fmt(todayAmt) + ' hôm nay';
  document.getElementById('statSessions').textContent   = sales.length;
  document.getElementById('statAvg').textContent        = fmt(avg);
  document.getElementById('statDays').textContent       = days;

  // Daily chart — last 14 days
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    last14.push(dt.toISOString().slice(0,10));
  }
  const dailyMap = {};
  sales.forEach(s => { dailyMap[s.date] = (dailyMap[s.date]||0) + (s.total||0); });
  const dailyData   = last14.map(d => dailyMap[d] || 0);
  const dailyLabels = last14.map(d => d.slice(5));

  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(document.getElementById('chartDaily').getContext('2d'), {
    type: 'bar',
    data: { labels: dailyLabels, datasets: [{ label: 'Doanh thu', data: dailyData,
      backgroundColor: dailyData.map((_,i) => i===13 ? '#1565C0' : 'rgba(21,101,192,0.18)'),
      borderRadius: 6, borderSkipped: false }] },
    options: { responsive: true, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
      scales: { y: { ticks: { color:'#7A8CA0', callback: v => fmtShort(v) }, grid: { color:'#DDE3ED' } },
                x: { ticks: { color:'#7A8CA0' }, grid: { display: false } } } }
  });

  // Product pie
  const prodMap = {};
  sales.forEach(s => (s.items||[]).forEach(item =>
    { prodMap[item.name] = (prodMap[item.name]||0) + item.qty * item.price; }
  ));
  const prodLabels = Object.keys(prodMap);
  const prodVals   = Object.values(prodMap);
  const COLORS = ['#1565C0','#2E7D32','#F57C00','#C62828','#6A1B9A','#00838F','#AD1457','#558B2F'];

  if (chartProd) chartProd.destroy();
  const ctxP = document.getElementById('chartProducts').getContext('2d');
  if (!prodLabels.length) {
    ctxP.clearRect(0,0,9999,9999);
    ctxP.fillStyle='#7A8CA0'; ctxP.textAlign='center'; ctxP.font='14px Be Vietnam Pro';
    ctxP.fillText('Chưa có dữ liệu', 170, 100); chartProd = null;
  } else {
    chartProd = new Chart(ctxP, { type:'doughnut',
      data: { labels: prodLabels, datasets: [{ data: prodVals,
        backgroundColor: COLORS.slice(0, prodLabels.length), borderWidth: 0, hoverOffset: 8 }] },
      options: { responsive: true, cutout:'62%',
        plugins: { legend: { position:'bottom', labels: { color:'#3D5066', boxWidth:10, font:{size:11} } },
          tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } } }
    });
  }

  // Recent table
  const tbody  = document.getElementById('recentBody');
  const recent = [...sales].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,10);
  tbody.innerHTML = recent.length === 0
    ? `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">Chưa có ca nào</td></tr>`
    : recent.map(s => `<tr>
        <td>${s.date}</td>
        <td><span class="history-shift">${s.shift}</span></td>
        <td style="color:var(--text2)">${(s.items||[]).map(i=>i.name).join(', ')||'—'}</td>
        <td>${(s.items||[]).reduce((a,i)=>a+i.qty,0)}</td>
        <td class="badge-accent">${fmt(s.total||0)}</td>
        <td style="color:var(--text3)">${s.person||'—'}</td>
      </tr>`).join('');
}

/* ─── SALES ENTRY ─────────────────────────────────────────────────── */
document.getElementById('saleDate').value = today();
let saleItemCount = 0;

function buildItemRow(idx) {
  const opts = productsCache.map(p =>
    `<option value="${p.name}" data-price="${p.price}">${p.name} (${fmt(p.price)})</option>`
  ).join('');
  return `<div class="sale-item" id="sitem-${idx}">
    <select class="item-select" data-idx="${idx}">
      <option value="">— Chọn sản phẩm —</option>${opts}
      <option value="__custom__">+ Nhập thủ công</option>
    </select>
    <input type="number" class="item-qty" data-idx="${idx}" placeholder="Số lượng" min="1" value="1" />
    <input type="number" class="item-price" data-idx="${idx}" placeholder="Đơn giá (đ)" min="0" />
    <span class="item-subtotal" id="isub-${idx}">0đ</span>
    <button class="btn-remove" onclick="removeItem(${idx})">×</button>
  </div>`;
}

function addItem() {
  const idx = saleItemCount++;
  const container = document.getElementById('saleItems');
  const div = document.createElement('div');
  div.innerHTML = buildItemRow(idx);
  container.appendChild(div.firstElementChild);
  bindItemEvents(idx); updateSaleTotal();
}

function bindItemEvents(idx) {
  const sel   = document.querySelector(`.item-select[data-idx="${idx}"]`);
  const qty   = document.querySelector(`.item-qty[data-idx="${idx}"]`);
  const price = document.querySelector(`.item-price[data-idx="${idx}"]`);
  sel.addEventListener('change', () => {
    if (sel.value !== '__custom__') price.value = sel.selectedOptions[0].dataset.price || '';
    updateItemSub(idx);
  });
  qty.addEventListener('input',   () => updateItemSub(idx));
  price.addEventListener('input', () => updateItemSub(idx));
}

function updateItemSub(idx) {
  const qty   = parseFloat(document.querySelector(`.item-qty[data-idx="${idx}"]`)?.value)   || 0;
  const price = parseFloat(document.querySelector(`.item-price[data-idx="${idx}"]`)?.value) || 0;
  const sub   = document.getElementById(`isub-${idx}`);
  if (sub) sub.textContent = fmt(qty * price);
  updateSaleTotal();
}

window.removeItem = (idx) => {
  document.getElementById(`sitem-${idx}`)?.remove();
  updateSaleTotal();
};

function updateSaleTotal() {
  let total = 0;
  document.querySelectorAll('.sale-item').forEach(row => {
    const idx   = row.id.replace('sitem-','');
    const qty   = parseFloat(document.querySelector(`.item-qty[data-idx="${idx}"]`)?.value)   || 0;
    const price = parseFloat(document.querySelector(`.item-price[data-idx="${idx}"]`)?.value) || 0;
    total += qty * price;
  });
  document.getElementById('saleTotalPreview').textContent = fmt(total);
}

function gatherSaleItems() {
  const items = [];
  document.querySelectorAll('.sale-item').forEach(row => {
    const idx   = row.id.replace('sitem-','');
    const sel   = document.querySelector(`.item-select[data-idx="${idx}"]`);
    const qty   = parseFloat(document.querySelector(`.item-qty[data-idx="${idx}"]`)?.value)   || 0;
    const price = parseFloat(document.querySelector(`.item-price[data-idx="${idx}"]`)?.value) || 0;
    const name  = (!sel.value || sel.value === '__custom__') ? '(Thủ công)' : sel.value;
    if (name && qty > 0 && price > 0) items.push({ name, qty, price });
  });
  return items;
}

document.getElementById('addItemBtn').addEventListener('click', addItem);

document.getElementById('saveSaleBtn').addEventListener('click', async () => {
  const date   = document.getElementById('saleDate').value;
  const shift  = document.getElementById('saleShift').value;
  const person = document.getElementById('salePerson').value.trim();
  const note   = document.getElementById('saleNote').value.trim();
  if (!date) return showToast('Vui lòng chọn ngày', 'error');
  const items = gatherSaleItems();
  if (!items.length) return showToast('Vui lòng thêm ít nhất 1 mặt hàng', 'error');
  const total  = items.reduce((s,i) => s + i.qty*i.price, 0);
  const record = { date, shift, person, note, items, total, createdAt: Date.now(),
                   createdBy: currentUser?.email || '—' };
  try {
    await push(ref(db, 'sales'), record);
    clearSaleForm();
    showToast('✅ Đã lưu lên cloud!', 'success');
  } catch(e) {
    showToast('Lỗi lưu dữ liệu: ' + e.message, 'error');
  }
});

document.getElementById('clearSaleBtn').addEventListener('click', clearSaleForm);

function clearSaleForm() {
  document.getElementById('saleDate').value  = today();
  document.getElementById('saleNote').value  = '';
  document.getElementById('saleItems').innerHTML = '';
  saleItemCount = 0;
  document.getElementById('saleTotalPreview').textContent = '0đ';
  addItem();
}

/* ─── PRODUCTS ────────────────────────────────────────────────────── */

// Tab switching
document.querySelectorAll('.prod-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.prod-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.prod-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
  });
});

// Category filter buttons
document.querySelectorAll('.menu-cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.menu-cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMenuGrid(btn.dataset.cat);
  });
});

function getCatEmoji(cat) {
  const map = { 'Đồ uống': '🥤', 'Đồ ăn': '🍱', 'Bánh': '🧁', 'Khác': '🎁' };
  return map[cat] || '📦';
}

function renderMenuGrid(filterCat = '') {
  const grid = document.getElementById('menuGrid');
  let products = productsCache;
  if (filterCat) products = products.filter(p => p.category === filterCat);
  if (!products.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><p>Chưa có sản phẩm nào</p></div>`;
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="menu-card">
      ${p.image
        ? `<img class="menu-card-img" src="${p.image}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="menu-card-img-placeholder" style="display:none">${getCatEmoji(p.category)}</div>`
        : `<div class="menu-card-img-placeholder">${getCatEmoji(p.category)}</div>`}
      <div class="menu-card-body">
        <div class="menu-card-cat">${p.category}</div>
        <div class="menu-card-name">${p.name}</div>
        <div class="menu-card-price">${p.price.toLocaleString('vi-VN')}<span class="menu-card-price-unit"> đ</span></div>
      </div>
    </div>`).join('');
}

function renderManageList() {
  const list = document.getElementById('manageList');
  if (!productsCache.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>Chưa có sản phẩm. Thêm sản phẩm đầu tiên!</p></div>`;
    return;
  }
  list.innerHTML = productsCache.map(p => `
    <div class="manage-item">
      ${p.image
        ? `<img class="manage-item-img" src="${p.image}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="manage-item-img-placeholder" style="display:none">${getCatEmoji(p.category)}</div>`
        : `<div class="manage-item-img-placeholder">${getCatEmoji(p.category)}</div>`}
      <div class="manage-item-info">
        <div class="manage-item-name">${p.name}</div>
        <div class="manage-item-meta">${p.category}</div>
      </div>
      <div class="manage-item-price">${fmt(p.price)}</div>
      <div class="manage-item-actions">
        <button class="btn-edit-prod" onclick="editProduct('${p.id}')">✏ Sửa</button>
        <button class="btn-remove" onclick="deleteProduct('${p.id}')" title="Xoá">×</button>
      </div>
    </div>`).join('');
}

function renderProducts() {
  renderMenuGrid(document.querySelector('.menu-cat-btn.active')?.dataset.cat || '');
  renderManageList();
}

// Edit product
let editingId = null;
window.editProduct = (id) => {
  const p = productsCache.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('prodName').value     = p.name;
  document.getElementById('prodCategory').value = p.category;
  document.getElementById('prodPrice').value    = p.price;
  document.getElementById('prodImage').value    = p.image || '';
  document.getElementById('addProductBtn').textContent  = '💾 Lưu thay đổi';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('manageFormTitle').textContent = '✏️ Đang chỉnh sửa sản phẩm';
  document.getElementById('prodName').focus();
  // scroll lên form
  document.getElementById('tabManage').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('prodName').value    = '';
  document.getElementById('prodPrice').value   = '';
  document.getElementById('prodImage').value   = '';
  document.getElementById('addProductBtn').textContent   = '+ Thêm sản phẩm';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('manageFormTitle').textContent = '➕ Thêm sản phẩm mới';
});

document.getElementById('addProductBtn').addEventListener('click', async () => {
  const name     = document.getElementById('prodName').value.trim();
  const category = document.getElementById('prodCategory').value;
  const price    = parseFloat(document.getElementById('prodPrice').value);
  const image    = document.getElementById('prodImage').value.trim();
  if (!name)                  return showToast('Vui lòng nhập tên sản phẩm', 'error');
  if (isNaN(price)||price<0)  return showToast('Vui lòng nhập giá hợp lệ', 'error');
  try {
    if (editingId) {
      await set(ref(db, 'products/' + editingId), { name, category, price, image });
      showToast(`Đã cập nhật "${name}"!`, 'success');
      editingId = null;
      document.getElementById('addProductBtn').textContent   = '+ Thêm sản phẩm';
      document.getElementById('cancelEditBtn').style.display = 'none';
      document.getElementById('manageFormTitle').textContent = '➕ Thêm sản phẩm mới';
    } else {
      await push(ref(db, 'products'), { name, category, price, image });
      showToast(`Đã thêm "${name}"!`, 'success');
    }
    document.getElementById('prodName').value  = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodImage').value = '';
  } catch(e) {
    showToast('Lỗi: ' + e.message, 'error');
  }
});

window.deleteProduct = async (id) => {
  if (!confirm('Xoá sản phẩm này?')) return;
  await remove(ref(db, 'products/' + id));
  showToast('Đã xoá sản phẩm', '');
};

/* ─── HISTORY ─────────────────────────────────────────────────────── */
let historyFiltered = null;

function renderHistory(fromFilter = false) {
  let sales = [...salesCache].sort((a,b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.createdAt||0) - (a.createdAt||0);
  });
  if (fromFilter) {
    const from  = document.getElementById('filterFrom').value;
    const to    = document.getElementById('filterTo').value;
    const shift = document.getElementById('filterShift').value;
    if (from)  sales = sales.filter(s => s.date >= from);
    if (to)    sales = sales.filter(s => s.date <= to);
    if (shift) sales = sales.filter(s => s.shift === shift);
  }
  const list = document.getElementById('historyList');
  if (!sales.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Không có dữ liệu phù hợp</p></div>`;
    return;
  }
  list.innerHTML = sales.map(s => `
    <div class="history-card">
      <div class="history-head">
        <div class="history-meta">
          <div class="history-date">${s.date}</div>
          <span class="history-shift">${s.shift}</span>
          ${s.person ? `<div class="history-person">👤 ${s.person}</div>` : ''}
        </div>
        <div class="history-total">${fmt(s.total||0)}</div>
      </div>
      <div class="history-items">
        ${(s.items||[]).map(i=>`<span class="history-item-tag">${i.name} ×${i.qty} = ${fmt(i.qty*i.price)}</span>`).join('')}
      </div>
      ${s.note ? `<div class="history-note">📝 ${s.note}</div>` : ''}
      <div class="history-actions">
        <span style="font-size:11px;color:var(--text3)">nhập bởi ${s.createdBy||'—'}</span>
        <button class="btn-del-history" onclick="deleteSale('${s.id}')">🗑 Xoá</button>
      </div>
    </div>`).join('');
}

window.deleteSale = async (id) => {
  if (!confirm('Xoá ca bán hàng này?')) return;
  await remove(ref(db, 'sales/' + id));
  showToast('Đã xoá ca bán hàng', '');
};

document.getElementById('filterBtn').addEventListener('click',      () => renderHistory(true));
document.getElementById('clearFilterBtn').addEventListener('click', () => {
  document.getElementById('filterFrom').value  = '';
  document.getElementById('filterTo').value    = '';
  document.getElementById('filterShift').value = '';
  renderHistory(false);
});

/* ─── REPORT ──────────────────────────────────────────────────────── */
function renderReport() {
  const sales = [...salesCache].sort((a,b) => b.date.localeCompare(a.date));
  const dayMap = {};
  sales.forEach(s => {
    if (!dayMap[s.date]) dayMap[s.date] = { count:0, total:0 };
    dayMap[s.date].count++; dayMap[s.date].total += s.total||0;
  });
  const tbody = document.getElementById('summaryBody');
  const days  = Object.keys(dayMap).sort((a,b) => b.localeCompare(a));
  tbody.innerHTML = !days.length
    ? `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">Chưa có dữ liệu</td></tr>`
    : days.map(d => {
        const { count, total } = dayMap[d];
        return `<tr><td>${d}</td><td>${count}</td><td class="badge-accent">${fmt(total)}</td><td style="color:var(--text2)">${fmt(Math.round(total/count))}</td></tr>`;
      }).join('');
}

document.getElementById('exportExcelBtn').addEventListener('click', () => {
  if (!salesCache.length) return showToast('Chưa có dữ liệu', 'error');
  const rows = [['Ngày','Ca','Người nhập','Sản phẩm','Số lượng','Đơn giá','Thành tiền','Tổng ca','Ghi chú']];
  [...salesCache].sort((a,b)=>a.date.localeCompare(b.date)).forEach(s => {
    (s.items?.length ? s.items : [{}]).forEach((item,i) => rows.push([
      i===0?s.date:'', i===0?s.shift:'', i===0?(s.person||''):'',
      item.name||'', item.qty||'', item.price||'', (item.qty*item.price)||'',
      i===0?s.total:'', i===0?(s.note||''):'',
    ]));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [10,10,14,20,8,10,12,12,20].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bán hàng');
  XLSX.writeFile(wb, 'BaoCaoGayQuy_'+today()+'.xlsx');
  showToast('Đã xuất Excel!', 'success');
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!salesCache.length) return showToast('Chưa có dữ liệu', 'error');
  const lines = [['Ngày','Ca','Người nhập','Sản phẩm','SL','Đơn giá','Thành tiền','Tổng ca','Ghi chú'].join(',')];
  [...salesCache].sort((a,b)=>a.date.localeCompare(b.date)).forEach(s =>
    (s.items?.length ? s.items : [{}]).forEach((item,i) =>
      lines.push([i===0?s.date:'',i===0?s.shift:'',i===0?(s.person||''):'',
        item.name||'',item.qty||'',item.price||'',(item.qty*item.price)||'',
        i===0?s.total:'',i===0?(s.note||''):''].map(v=>`"${v}"`).join(','))
    )
  );
  const blob = new Blob(['\ufeff'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'BaoCaoGayQuy_'+today()+'.csv'; a.click();
  showToast('Đã xuất CSV!', 'success');
});

document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('⚠️ Xoá TOÀN BỘ dữ liệu bán hàng? Không thể hoàn tác!')) return;
  if (!confirm('Xác nhận lần 2?')) return;
  await remove(ref(db, 'sales'));
  showToast('Đã xoá toàn bộ dữ liệu', 'error');
});

/* ─── INIT ────────────────────────────────────────────────────────── */
function initUI() {
  document.getElementById('topbarDate').textContent =
    new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  // seed default products if none exist
  get(ref(db, 'products')).then(snap => {
    if (!snap.exists()) {
      [['Trà sữa','Đồ uống',25000],['Nước ép cam','Đồ uống',20000],
       ['Bánh mì','Đồ ăn',15000],['Xôi','Đồ ăn',18000],['Bánh flan','Bánh',12000]]
      .forEach(([name,category,price]) => push(ref(db,'products'), {name,category,price}));
    }
  });
  addItem();
  renderDashboard();
}

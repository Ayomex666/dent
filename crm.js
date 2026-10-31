/* ═══════════════════════════════════════════════════════════════════════════
   CRM ADMIN PANEL — JAVASCRIPT
   ══════════════════════════════════════════════════════════════════════════ */

let ADMIN_API = ''; 
if (window.location.protocol === 'file:') {
  ADMIN_API = 'http://localhost:3000';
}
let TOKEN = localStorage.getItem('crmToken') || null;
let allAppointments = [];
let currentAppt = null;
let profitChart = null;
let currentChartPeriod = 'week';

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const el = document.getElementById('clockBadge');
  if (el) {
    el.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} · ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
}
setInterval(updateClock, 1000);
updateClock();

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (TOKEN) {
    showCRM();
  }
  // Auto-refresh data every 60s
  setInterval(refreshData, 60000);
});

// ─── Login ────────────────────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');

  btn.disabled = true;
  btn.textContent = 'Входим...';
  errEl.style.display = 'none';

  try {
    const res = await fetch(`${ADMIN_API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Ошибка входа';
      errEl.style.display = 'block';
      return;
    }

    TOKEN = data.token;
    localStorage.setItem('crmToken', TOKEN);
    document.getElementById('adminEmail').textContent = data.email;
    showCRM();

  } catch (err) {
    errEl.textContent = 'Ошибка подключения к серверу';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
}

function togglePassword() {
  const input = document.getElementById('loginPassword');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showCRM() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('crmApp').style.display = 'flex';
  refreshData();
}

function logout() {
  TOKEN = null;
  localStorage.removeItem('crmToken');
  location.reload();
}

// ─── Section switching ─────────────────────────────────────────────────────────
function showSection(name, link) {
  document.querySelectorAll('.crm-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`section${capitalize(name)}`).style.display = 'block';
  link.classList.add('active');

  const titles = { dashboard: 'Дашборд', appointments: 'Все записи' };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  if (name === 'appointments') {
    loadAppointments();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Refresh All Data ─────────────────────────────────────────────────────────
async function refreshData() {
  if (!TOKEN) return;
  await Promise.all([loadStats(), loadAppointments()]);
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
  if (!TOKEN) return;
  try {
    const res = await fetch(`${ADMIN_API}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    document.getElementById('statToday').textContent = data.todayCount ?? '—';
    document.getElementById('statWeek').textContent = data.weekCount ?? '—';
    document.getElementById('statMonth').textContent = data.monthCount ?? '—';
    document.getElementById('statYear').textContent = data.yearCount ?? '—';
    document.getElementById('statTotal').textContent = data.totalCount ?? '—';
    document.getElementById('statPriced').textContent = data.priceSetCount ?? '—';
  } catch {}
}

// ─── Appointments ─────────────────────────────────────────────────────────────
async function loadAppointments() {
  if (!TOKEN) return;
  try {
    const res = await fetch(`${ADMIN_API}/api/admin/appointments`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (res.status === 401) { logout(); return; }
    allAppointments = await res.json();
    renderAppointments(allAppointments);
    updateProfitChart(currentChartPeriod);
  } catch {
    document.getElementById('apptList').innerHTML = '<div class="empty">Ошибка загрузки</div>';
  }
}

// ─── Profit Chart ────────────────────────────────────────────────────────────
function setChartPeriod(period) {
  currentChartPeriod = period;
  document.querySelectorAll('.profit-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.profit-tab[onclick="setChartPeriod('${period}')"]`).classList.add('active');
  updateProfitChart(period);
}

function updateProfitChart(period) {
  const ctx = document.getElementById('profitChart');
  if (!ctx || !allAppointments) return;

  const now = new Date();
  let startDate = new Date();
  
  if (period === 'week') {
    startDate.setDate(now.getDate() - 6);
  } else if (period === 'month') {
    startDate.setDate(now.getDate() - 30);
  } else if (period === 'year') {
    startDate.setMonth(now.getMonth() - 11);
    startDate.setDate(1);
  }

  startDate.setHours(0,0,0,0);

  // Filter priced appointments within time range
  const validAppts = allAppointments.filter(a => {
    if (a.final_price === null) return false;
    const d = new Date(a.date + 'T00:00:00');
    return d >= startDate && d <= now;
  });

  // Group by date or month
  const grouped = {};
  let totalSum = 0;

  validAppts.forEach(a => {
    const d = new Date(a.date + 'T00:00:00');
    let label = '';
    
    if (period === 'year') {
      const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
      label = `${months[d.getMonth()]} ${d.getFullYear()}`;
    } else {
      label = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth()+1).padStart(2, '0')}`;
    }

    if (!grouped[label]) grouped[label] = 0;
    grouped[label] += a.final_price;
    totalSum += a.final_price;
  });

  document.getElementById('profitTotalSum').textContent = totalSum.toLocaleString('ru') + ' сомони';

  // Sort labels chronologically based on their appearance in the time range
  // Simple way: generate all labels in range, then lookup in `grouped`
  const labels = [];
  const data = [];

  let cur = new Date(startDate);
  while (cur <= now) {
    let label = '';
    if (period === 'year') {
      const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
      label = `${months[cur.getMonth()]} ${cur.getFullYear()}`;
      if (!labels.includes(label)) {
        labels.push(label);
        data.push(grouped[label] || 0);
      }
      cur.setMonth(cur.getMonth() + 1);
    } else {
      label = `${String(cur.getDate()).padStart(2, '0')}.${String(cur.getMonth()+1).padStart(2, '0')}`;
      labels.push(label);
      data.push(grouped[label] || 0);
      cur.setDate(cur.getDate() + 1);
    }
  }

  if (profitChart) {
    profitChart.destroy();
  }

  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Прибыль (сомони)',
        data: data,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3 // Smooth curves
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { 
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          ticks: { color: '#94A3B8' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94A3B8' }
        }
      }
    }
  });
}

function filterAppointments() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('filterStatus').value;

  let filtered = allAppointments.filter(a => {
    const matchesSearch = !q ||
      a.client_name.toLowerCase().includes(q) ||
      a.client_phone.includes(q) ||
      a.procedure.toLowerCase().includes(q);

    const matchesStatus = !status ||
      (status === 'priced' && a.final_price !== null) ||
      (status === 'unpriced' && a.final_price === null);

    return matchesSearch && matchesStatus;
  });

  renderAppointments(filtered);
}

const PROC_ICONS = {
  'Удаление зуба': '🦷',
  'Пломбирование': '🔧',
  'Чистка зубов': '✨',
  'Установка коронки': '👑',
  'Лечение канала': '🔬',
  'Отбеливание зубов': '💎',
  'Консультация': '💬',
};

function renderAppointments(list) {
  const container = document.getElementById('apptList');
  if (!list.length) {
    container.innerHTML = '<div class="empty">📭 Записей не найдено</div>';
    return;
  }

  const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  container.innerHTML = list.map(a => {
    const d = new Date(a.date + 'T12:00:00');
    const dateStr = `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
    const icon = PROC_ICONS[a.procedure] || '📋';
    const priced = a.final_price !== null;

    return `
      <div class="appt-card" onclick="openApptModal('${a.id}')">
        <div class="appt-card__avatar">${icon}</div>
        <div class="appt-card__info">
          <div class="appt-card__name">${escHtml(a.client_name)}</div>
          <div class="appt-card__sub">${escHtml(a.client_phone)} · ${escHtml(a.procedure)}</div>
        </div>
        <div class="appt-card__right">
          <div class="appt-card__datetime">${dateStr}, ${a.time}</div>
          <span class="appt-card__badge ${priced ? 'badge--priced' : 'badge--unpriced'}">
            ${priced ? '✅ ' + Number(a.final_price).toLocaleString('ru') + ' сом.' : '⏳ Цена не задана'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Appointment Detail Modal ──────────────────────────────────────────────────
function openApptModal(id) {
  const a = allAppointments.find(x => String(x.id) === String(id));
  if (!a) return;
  currentAppt = a;

  const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const d = new Date(a.date + 'T12:00:00');
  const dateStr = `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;

  const icon = PROC_ICONS[a.procedure] || '📋';
  document.getElementById('apptModalIcon').textContent = icon;
  document.getElementById('apptModalName').textContent = a.client_name;
  document.getElementById('apptModalMeta').textContent = a.procedure;
  document.getElementById('detailPhone').textContent = a.client_phone;
  document.getElementById('detailProc').textContent = a.procedure;
  document.getElementById('detailDateTime').textContent = `${dateStr} в ${a.time}`;

  const created = a.created_at ? new Date(a.created_at).toLocaleString('ru') : '—';
  document.getElementById('detailCreated').textContent = created;

  // Price section
  if (a.final_price !== null) {
    document.getElementById('priceSetForm').style.display = 'none';
    document.getElementById('priceSetDone').style.display = 'block';
    document.getElementById('priceDisplayVal').textContent = Number(a.final_price).toLocaleString('ru') + ' сомони';
    document.getElementById('btnNoShow').style.display = 'none';
  } else {
    document.getElementById('priceSetForm').style.display = 'block';
    document.getElementById('priceSetDone').style.display = 'none';
    document.getElementById('priceInput').value = '';
    document.getElementById('priceError').style.display = 'none';
    document.getElementById('btnNoShow').style.display = 'block';
  }

  document.getElementById('apptModal').classList.add('active');
}

function closeApptModal() {
  document.getElementById('apptModal').classList.remove('active');
  currentAppt = null;
}

// ─── Save Price ───────────────────────────────────────────────────────────────
async function savePrice() {
  if (!currentAppt) return;
  const val = parseFloat(document.getElementById('priceInput').value);
  const errEl = document.getElementById('priceError');

  if (isNaN(val) || val < 0) {
    errEl.textContent = 'Введите корректную сумму';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`${ADMIN_API}/api/admin/appointments/${currentAppt.id}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ final_price: val })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Ошибка';
      errEl.style.display = 'block';
      return;
    }

    // Update local data
    const idx = allAppointments.findIndex(x => x.id === currentAppt.id);
    if (idx !== -1) allAppointments[idx].final_price = val;

    // Update modal view
    document.getElementById('priceSetForm').style.display = 'none';
    document.getElementById('priceSetDone').style.display = 'block';
    document.getElementById('priceDisplayVal').textContent = val.toLocaleString('ru') + ' сомони';
    document.getElementById('btnNoShow').style.display = 'none';

    renderAppointments(allAppointments);
    updateProfitChart(currentChartPeriod);

  } catch {
    errEl.textContent = 'Ошибка подключения';
    errEl.style.display = 'block';
  }
}

// ─── Mark No Show (Delete) ────────────────────────────────────────────────────
function markNoShow() {
  if (!currentAppt) return;
  document.getElementById('confirmName').textContent = currentAppt.client_name;

  const confirmModal = document.getElementById('confirmModal');
  confirmModal.classList.add('active');

  document.getElementById('confirmDeleteBtn').onclick = async () => {
    try {
      const res = await fetch(`${ADMIN_API}/api/admin/appointments/${currentAppt.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
      if (!res.ok) { alert('Ошибка удаления'); return; }

      allAppointments = allAppointments.filter(x => x.id !== currentAppt.id);
      renderAppointments(allAppointments);
      closeConfirm();
      closeApptModal();
      loadStats();
    } catch {
      alert('Ошибка подключения');
    }
  };
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('active');
}

// Click outside to close modals
document.getElementById('apptModal').addEventListener('click', function(e) {
  if (e.target === this) closeApptModal();
});
document.getElementById('confirmModal').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});

// ─── Utils ────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

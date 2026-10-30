// ============================================================
// DentaPRO — Dental Clinic Management System
// Supabase Auth + RLS version
// ============================================================

const SUPABASE_URL = 'https://zaudyvlmxsptjinnweve.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EsKXpfcMlzcP9A_IY8FqPA_Qp4d4wR9';

// ===== APP STATE =====
let sb = null;
let currentUser = null;    // auth user
let currentProfile = null; // profiles row
let currentPatient = null;
let myServices = [];
let syncInterval = null;
let notifCurrentId = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!navigator.onLine) { showNoInternet(); return; }

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Restore session
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    if (currentProfile) {
      if (currentProfile.is_blocked) { showBlockedOverlay(); return; }
      startApp();
      return;
    }
  }

  showPage('page-login');
});

// ============================================================
// INTERNET
// ============================================================
window.addEventListener('online',  () => document.getElementById('no-internet-overlay').classList.add('hidden'));
window.addEventListener('offline', () => showNoInternet());

function showNoInternet() {
  document.getElementById('no-internet-overlay').classList.remove('hidden');
}
async function checkInternet() {
  if (navigator.onLine) { location.reload(); }
  else { showToast('Интернет недоступен', 'error'); }
}
function showBlockedOverlay() {
  document.getElementById('blocked-overlay').classList.remove('hidden');
}

// ============================================================
// PAGE NAV
// ============================================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');
}

// ============================================================
// AUTH — LOGIN
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  if (!navigator.onLine) { showNoInternet(); return; }

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  const spinner  = document.getElementById('login-spinner');
  const btnText  = document.getElementById('login-btn-text');

  errEl.classList.add('hidden');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  btnText.textContent = 'Вход...';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(getAuthError(error.message));

    currentUser = data.user;
    await loadProfile();

    if (!currentProfile) throw new Error('Профиль не найден. Обратитесь к администратору.');
    if (currentProfile.is_blocked) { showBlockedOverlay(); return; }

    startApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
    btnText.textContent = 'Войти';
  }
}

function getAuthError(msg) {
  if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) return 'Неверный email или пароль';
  if (msg.includes('Email not confirmed')) return 'Email не подтверждён. Проверьте почту.';
  if (msg.includes('Too many')) return 'Слишком много попыток. Подождите немного.';
  return 'Ошибка входа. Проверьте email и пароль.';
}

async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (!error && data) currentProfile = data;
}

// ============================================================
// LOGOUT
// ============================================================
async function logout() {
  if (syncInterval) clearInterval(syncInterval);
  hideProfileMenu();
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('blocked-overlay').classList.add('hidden');
  showPage('page-login');
}

// ============================================================
// START APP
// ============================================================
function startApp() {
  if (currentProfile.role === 'admin') {
    showPage('page-admin');
    loadAdminDashboard();
  } else {
    showPage('page-dashboard');
    updateDentistHeader();
    loadDashboard();
    loadNotifications();
    checkAndGenerateNotifications();
    startSyncInterval();
  }
}

// Auto-sync every 2 hours
function startSyncInterval() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (!navigator.onLine || !currentProfile) return;
    if (currentProfile.role !== 'admin') {
      loadDashboard();
      loadNotifications();
      checkAndGenerateNotifications();
    }
  }, 2 * 60 * 60 * 1000);
}

// ============================================================
// FORGOT PASSWORD MODAL
// ============================================================
function showForgotModal() {
  document.getElementById('forgot-modal').classList.remove('hidden');
}
function closeForgotModal(e) {
  if (e.target === document.getElementById('forgot-modal')) {
    document.getElementById('forgot-modal').classList.add('hidden');
  }
}
function closeForgotModalBtn() {
  document.getElementById('forgot-modal').classList.add('hidden');
}

// ============================================================
// TOGGLE PASSWORD
// ============================================================
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

// ============================================================
// ADMIN PANEL
// ============================================================
async function loadAdminDashboard() {
  const { data: dentists, error } = await sb
    .from('profiles')
    .select('*')
    .eq('role', 'dentist')
    .order('created_at', { ascending: false });

  if (error) { showToast('Ошибка загрузки: ' + error.message, 'error'); return; }

  const total   = dentists?.length || 0;
  const active  = dentists?.filter(d => !d.is_blocked).length || 0;
  const blocked = dentists?.filter(d => d.is_blocked).length || 0;

  document.getElementById('admin-total-dentists').textContent   = total;
  document.getElementById('admin-active-dentists').textContent  = active;
  document.getElementById('admin-blocked-dentists').textContent = blocked;

  renderDentistsList(dentists || []);
}

function renderDentistsList(dentists) {
  const container = document.getElementById('admin-dentists-list');
  if (!dentists.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:48px;margin-bottom:16px">👨‍⚕️</div>
        <p>Нет стоматологов</p>
        <p style="font-size:12px;margin-top:8px;color:var(--text-muted)">Нажмите «Добавить» чтобы создать первого</p>
      </div>`;
    return;
  }
  container.innerHTML = dentists.map(d => `
    <div class="dentist-card ${d.is_blocked ? 'blocked' : ''}" id="dcard-${d.id}">
      <div class="dentist-avatar">${getInitials(d.full_name || d.email)}</div>
      <div class="dentist-info">
        <div class="dentist-name">${d.full_name || 'Без имени'}</div>
        <div class="dentist-email">${d.email}</div>
        <span class="dentist-status ${d.is_blocked ? 'blocked' : 'active'}">
          ${d.is_blocked ? '🚫 Заблокирован' : '✅ Активен'}
        </span>
      </div>
      <div class="dentist-actions">
        <button class="btn-danger" onclick="toggleBlockDentist('${d.id}',${d.is_blocked})">
          ${d.is_blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
      </div>
    </div>
  `).join('');
}

async function toggleBlockDentist(dentistId, isCurrentlyBlocked) {
  const { error } = await sb
    .from('profiles')
    .update({ is_blocked: !isCurrentlyBlocked })
    .eq('id', dentistId);
  if (error) { showToast('Ошибка: ' + error.message, 'error'); return; }
  showToast(isCurrentlyBlocked ? 'Стоматолог разблокирован' : 'Стоматолог заблокирован', 'success');
  loadAdminDashboard();
}

function adminNavTo(tab) {
  if (tab === 'home') { showPage('page-admin'); loadAdminDashboard(); }
}

function showAddDentistPage() {
  showPage('page-add-dentist');
  document.getElementById('add-dentist-form').reset();
  document.getElementById('add-dentist-error').classList.add('hidden');
}

function showAdminPage() {
  showPage('page-admin');
  loadAdminDashboard();
}

// NOTE: Adding dentist creates a Supabase Auth user.
// After adding, admin needs to log back in.
async function handleAddDentist(e) {
  e.preventDefault();
  const name     = document.getElementById('dentist-name').value.trim();
  const email    = document.getElementById('dentist-email').value.trim().toLowerCase();
  const password = document.getElementById('dentist-password').value;
  const phone    = document.getElementById('dentist-phone').value.trim();
  const errEl    = document.getElementById('add-dentist-error');
  const btn      = document.getElementById('add-dentist-btn');
  const spinner  = document.getElementById('add-dentist-spinner');

  errEl.classList.add('hidden');
  btn.disabled = true;
  spinner.classList.remove('hidden');

  try {
    // Sign up the new dentist
    const { data: signData, error: signErr } = await sb.auth.signUp({ email, password });
    if (signErr) throw new Error('Ошибка создания аккаунта: ' + signErr.message);

    const newUserId = signData.user?.id;
    if (!newUserId) throw new Error('Не удалось создать пользователя. Попробуйте снова.');

    // Upsert profile with dentist role
    const { error: profErr } = await sb.from('profiles').upsert({
      id:         newUserId,
      email,
      full_name:  name,
      phone:      phone || null,
      role:       'dentist',
      is_blocked: false
    });

    if (profErr) throw new Error('Профиль создан, но ошибка при сохранении данных: ' + profErr.message);

    showToast('Стоматолог добавлен! Войдите снова как администратор.', 'success');

    // Sign admin back out, then redirect to login
    await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showPage('page-login');
    showToast('Войдите как администратор снова', '');

  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

// ============================================================
// DENTIST DASHBOARD
// ============================================================
function updateDentistHeader() {
  if (!currentProfile) return;
  const name     = currentProfile.full_name || currentUser.email.split('@')[0];
  const initials = getInitials(name);

  document.getElementById('dentist-display-name').textContent = name.split(' ')[0];
  document.getElementById('header-avatar').textContent        = initials;
  document.getElementById('menu-avatar').textContent          = initials;
  document.getElementById('menu-user-name').textContent       = name;
  document.getElementById('menu-user-email').textContent      = currentUser.email;

  document.getElementById('settings-name').value  = currentProfile.full_name || '';
  document.getElementById('settings-phone').value = currentProfile.phone || '';
}

async function loadDashboard() {
  if (!currentProfile) return;
  try {
    const { data: patients, error } = await sb
      .from('patients')
      .select('*, visits(id, visit_date, amount)')
      .eq('dentist_id', currentProfile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const total = patients?.length || 0;
    document.getElementById('total-patients-count').textContent  = total;
    document.getElementById('patients-count-badge').textContent  = total;

    // today count
    const today = new Date().toISOString().slice(0, 10);
    let todayCount = 0;
    patients?.forEach(p => {
      p.visits?.forEach(v => { if (v.visit_date === today) todayCount++; });
    });
    document.getElementById('today-appointments-count').textContent = todayCount;

    renderPatientsList(patients || []);
  } catch (err) {
    showToast('Ошибка загрузки: ' + err.message, 'error');
  }
}

function renderPatientsList(patients) {
  const container = document.getElementById('patients-list');
  if (!patients.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:56px;margin-bottom:16px;filter:drop-shadow(0 0 20px rgba(59,130,246,.3))">🦷</div>
        <p style="font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Нет пациентов</p>
        <p style="font-size:13px;color:var(--text-muted)">Нажмите «+» чтобы добавить первого</p>
      </div>`;
    return;
  }

  window._allPatients = patients;

  container.innerHTML = patients.map((p, idx) => {
    const totalAmt   = p.total_amount || 0;
    const colorClass = `color-${idx % 8}`;
    const daysAgo    = p.last_visit_date ? getDaysAgo(p.last_visit_date) : null;

    return `
      <div class="patient-card" onclick="openPatientDetail('${p.id}')">
        <div class="patient-avatar ${colorClass}">${getInitials(p.name)}</div>
        <div class="patient-info">
          <div class="patient-name">${p.name}</div>
          <div class="patient-sub">📞 ${p.phone || '—'} ${p.age ? '• ' + p.age + ' лет' : ''}</div>
        </div>
        <div class="patient-meta">
          <div class="patient-amount">${formatMoney(totalAmt)}</div>
          <div class="patient-date">${daysAgo !== null ? formatDaysAgo(daysAgo) : 'Нет визитов'}</div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// NAV
// ============================================================
function dentistNavTo(tab) {
  if (tab === 'home') {
    showPage('page-dashboard');
    document.querySelectorAll('#page-dashboard .nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-home')?.classList.add('active');
  } else if (tab === 'settings') {
    showPage('page-settings');
    loadMyServices();
  }
}

// ============================================================
// SEARCH
// ============================================================
function searchPatients(query) {
  const clearBtn  = document.getElementById('search-clear');
  const resultsEl = document.getElementById('search-results');

  if (!query.trim()) { clearSearch(); return; }
  clearBtn.classList.remove('hidden');

  const patients = window._allPatients || [];
  const q        = query.toLowerCase();
  const matches  = patients.filter(p =>
    p.name?.toLowerCase().includes(q) || (p.phone || '').includes(q)
  );

  if (matches.length) {
    resultsEl.innerHTML = matches.map((p, idx) => `
      <div class="patient-card" onclick="openPatientDetail('${p.id}')"
        style="border-radius:0;border-left:none;border-right:none;border-top:none;">
        <div class="patient-avatar color-${idx % 8}">${getInitials(p.name)}</div>
        <div class="patient-info">
          <div class="patient-name">${p.name}</div>
          <div class="patient-sub">📞 ${p.phone || '—'}</div>
        </div>
        <div class="patient-meta">
          <div class="patient-amount">${formatMoney(p.total_amount)}</div>
        </div>
      </div>`).join('');
  } else {
    resultsEl.innerHTML = '<div class="empty-state" style="padding:20px;">Пациентов не найдено</div>';
  }
  resultsEl.classList.remove('hidden');
}

function clearSearch() {
  document.getElementById('patient-search').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
}

// ============================================================
// PROFILE MENU
// ============================================================
function showProfileMenu() {
  document.getElementById('profile-menu').classList.remove('hidden');
  document.getElementById('profile-overlay').classList.remove('hidden');
}
function hideProfileMenu() {
  document.getElementById('profile-menu').classList.add('hidden');
  document.getElementById('profile-overlay').classList.add('hidden');
}

// ============================================================
// NOTIFICATIONS
// ============================================================
async function checkAndGenerateNotifications() {
  if (!currentProfile) return;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data: patients } = await sb
    .from('patients')
    .select('id, name, last_visit_date, last_notified_date')
    .eq('dentist_id', currentProfile.id)
    .not('last_visit_date', 'is', null)
    .lt('last_visit_date', sixMonthsAgoStr);

  if (!patients?.length) return;

  for (const p of patients) {
    // Skip if already notified this month
    const thisMonth = today.slice(0, 7);
    if (p.last_notified_date?.slice(0, 7) === thisMonth) continue;

    // Check if unread notification already exists
    const { data: existing } = await sb
      .from('notifications')
      .select('id')
      .eq('dentist_id', currentProfile.id)
      .eq('patient_id', p.id)
      .maybeSingle();

    if (existing) continue;

    await sb.from('notifications').insert({
      dentist_id: currentProfile.id,
      patient_id: p.id,
      message: `Пациент ${p.name} был у вас более 6 месяцев назад. Рекомендуем связаться!`
    });

    await sb.from('patients')
      .update({ last_notified_date: today })
      .eq('id', p.id);
  }
}

async function loadNotifications() {
  if (!currentProfile) return;

  const { data: notifs } = await sb
    .from('notifications')
    .select('*, patients(name, phone, last_visit_date)')
    .eq('dentist_id', currentProfile.id)
    .order('created_at', { ascending: false });

  const count = notifs?.length || 0;
  const badge = document.getElementById('notif-badge');
  if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }

  const list = document.getElementById('notif-list');
  if (!notifs?.length) {
    list.innerHTML = '<div class="empty-state">Нет уведомлений</div>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item" onclick="openNotifDetail('${n.id}','${n.patient_id}')">
      <div class="notif-item-icon">🔔</div>
      <div>
        <div class="notif-item-text">${n.message}</div>
        <div class="notif-item-time">${formatDate(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadNotifications();
}

async function openNotifDetail(notifId, patientId) {
  notifCurrentId = notifId;
  document.getElementById('notifications-panel').classList.add('hidden');

  const { data: patient } = await sb
    .from('patients')
    .select('name, phone, last_visit_date')
    .eq('id', patientId)
    .single();

  const { data: notif } = await sb
    .from('notifications')
    .select('message')
    .eq('id', notifId)
    .single();

  document.getElementById('notif-detail-name').textContent  = patient?.name || '—';
  document.getElementById('notif-detail-phone').textContent = patient?.phone || '—';
  document.getElementById('notif-detail-date').textContent  = patient?.last_visit_date
    ? 'Последний визит: ' + formatDateShort(patient.last_visit_date)
    : 'Данных нет';
  document.getElementById('notif-detail-msg').textContent   = notif?.message || '';

  document.getElementById('notif-detail-modal').classList.remove('hidden');
}

function closeNotifDetail(e) {
  if (e.target === document.getElementById('notif-detail-modal')) closeNotifDetailBtn();
}

async function closeNotifDetailBtn() {
  document.getElementById('notif-detail-modal').classList.add('hidden');
  if (notifCurrentId) {
    await sb.from('notifications').delete().eq('id', notifCurrentId);
    notifCurrentId = null;
    loadNotifications();
  }
}

// ============================================================
// ADD PATIENT
// ============================================================
function showAddPatientPage() {
  const now   = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  document.getElementById('add-patient-form').reset();
  document.getElementById('patient-visit-date').value     = local;
  document.getElementById('services-container').innerHTML  = '';
  document.getElementById('add-patient-error').classList.add('hidden');
  document.getElementById('total-wrap').style.display     = 'none';

  showPage('page-add-patient');
  checkServicesAvailable();
}

async function checkServicesAvailable() {
  if (!currentProfile) return;
  const { data: services } = await sb
    .from('services')
    .select('*')
    .eq('dentist_id', currentProfile.id);

  myServices = services || [];
  const noMsg = document.getElementById('no-services-msg');
  const addBtn = document.querySelector('.btn-add-service');

  if (!myServices.length) {
    noMsg.style.display = 'block';
    if (addBtn) addBtn.style.display = 'none';
  } else {
    noMsg.style.display = 'none';
    if (addBtn) addBtn.style.display = 'inline-flex';
  }
}

function addServiceRow() {
  if (!myServices.length) { showToast('Сначала добавьте услуги в настройках', 'error'); return; }

  const container = document.getElementById('services-container');
  const rowId     = 'svc-row-' + Date.now();
  const row       = document.createElement('div');
  row.className   = 'service-row';
  row.id          = rowId;

  const options = myServices.map(s =>
    `<option value="${s.id}" data-price="${s.price}">${s.name} — ${formatMoney(s.price)}</option>`
  ).join('');

  row.innerHTML = `
    <select class="form-input service-select" onchange="updateTotal()">${options}</select>
    <input type="number" class="form-input service-qty" value="1" min="1" max="99"
      onchange="updateTotal()" style="width:60px;text-align:center;" />
    <button type="button" class="service-remove" onclick="removeServiceRow('${rowId}')">✕</button>
  `;

  container.appendChild(row);
  updateTotal();
  document.getElementById('total-wrap').style.display = 'flex';
}

function removeServiceRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  updateTotal();
  if (!document.getElementById('services-container').children.length) {
    document.getElementById('total-wrap').style.display = 'none';
  }
}

function updateTotal() {
  let total = 0;
  document.querySelectorAll('#services-container .service-row').forEach(row => {
    const select = row.querySelector('.service-select');
    const qty    = parseInt(row.querySelector('.service-qty').value) || 1;
    const price  = parseFloat(select.selectedOptions[0]?.dataset.price || 0);
    total += price * qty;
  });
  document.getElementById('services-total').textContent = formatMoney(total);
}

async function handleAddPatient(e) {
  e.preventDefault();
  if (!navigator.onLine) { showNoInternet(); return; }

  const name      = document.getElementById('patient-name').value.trim();
  const age       = document.getElementById('patient-age').value;
  const phone     = document.getElementById('patient-phone').value.trim();
  const visitDate = document.getElementById('patient-visit-date').value;
  const notes     = document.getElementById('patient-notes').value.trim();
  const errEl     = document.getElementById('add-patient-error');
  const btn       = document.getElementById('add-patient-btn');
  const spinner   = document.getElementById('add-patient-spinner');

  errEl.classList.add('hidden');
  btn.disabled = true;
  spinner.classList.remove('hidden');

  try {
    const visitDateOnly = visitDate
      ? new Date(visitDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const visitTime = visitDate
      ? new Date(visitDate).toTimeString().slice(0, 5)
      : null;

    // Collect services
    const serviceRows  = document.querySelectorAll('#services-container .service-row');
    let totalAmount    = 0;
    const selectedSvcs = [];

    serviceRows.forEach(row => {
      const select  = row.querySelector('.service-select');
      const qty     = parseInt(row.querySelector('.service-qty').value) || 1;
      const price   = parseFloat(select.selectedOptions[0]?.dataset.price || 0);
      const svcName = (select.selectedOptions[0]?.text || '').split(' — ')[0];
      totalAmount  += price * qty;
      selectedSvcs.push({ id: select.value, name: svcName, price, qty });
    });

    // Check if patient exists (same phone, same dentist)
    let patientId;
    const { data: existing } = await sb
      .from('patients')
      .select('id, total_amount')
      .eq('dentist_id', currentProfile.id)
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      patientId = existing.id;
      await sb.from('patients').update({
        name,
        age:             age ? parseInt(age) : null,
        total_amount:    (parseFloat(existing.total_amount) || 0) + totalAmount,
        last_visit_date: visitDateOnly
      }).eq('id', patientId);
    } else {
      const { data: newPat, error: pErr } = await sb
        .from('patients')
        .insert({
          dentist_id:      currentProfile.id,
          name,
          age:             age ? parseInt(age) : null,
          phone:           phone || null,
          total_amount:    totalAmount,
          last_visit_date: visitDateOnly
        })
        .select()
        .single();

      if (pErr) throw new Error('Ошибка: ' + pErr.message);
      patientId = newPat.id;
    }

    // Create visit
    const { error: vErr } = await sb.from('visits').insert({
      patient_id:  patientId,
      dentist_id:  currentProfile.id,
      services:    selectedSvcs,
      amount:      totalAmount,
      visit_date:  visitDateOnly,
      visit_time:  visitTime
    });

    if (vErr) throw new Error('Ошибка визита: ' + vErr.message);

    showToast('Пациент сохранён!', 'success');
    showPage('page-dashboard');
    loadDashboard();

  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

// ============================================================
// PATIENT DETAIL
// ============================================================
async function openPatientDetail(patientId) {
  showPage('page-patient-detail');
  document.getElementById('detail-name').textContent = 'Загрузка...';
  document.getElementById('detail-visits-list').innerHTML =
    '<div class="loading-state"><div class="loading-spinner"></div></div>';

  const { data: patient, error } = await sb
    .from('patients')
    .select('*, visits(id, visit_date, visit_time, amount, services)')
    .eq('id', patientId)
    .single();

  if (error || !patient) {
    showToast('Ошибка загрузки', 'error');
    showPage('page-dashboard');
    return;
  }

  currentPatient = patient;

  const initials = getInitials(patient.name);
  document.getElementById('detail-avatar').textContent      = initials;
  document.getElementById('detail-name').textContent        = patient.name;
  document.getElementById('detail-phone').textContent       = '📞 ' + (patient.phone || '—');
  document.getElementById('detail-age-tag').textContent     = patient.age ? patient.age + ' лет' : 'Возраст не указан';

  const daysAgo = patient.last_visit_date ? getDaysAgo(patient.last_visit_date) : null;
  document.getElementById('detail-last-visit-tag').textContent =
    daysAgo !== null ? formatDaysAgo(daysAgo) : 'Нет визитов';

  document.getElementById('detail-total-visits').textContent = patient.visits?.length || 0;
  document.getElementById('detail-total-amount').textContent  = formatMoney(patient.total_amount);

  renderVisitsList(patient.visits || []);
}

function renderVisitsList(visits) {
  const container = document.getElementById('detail-visits-list');
  if (!visits.length) {
    container.innerHTML = '<div class="empty-state">Нет записей о визитах</div>';
    return;
  }

  const sorted = [...visits].sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));

  container.innerHTML = sorted.map(v => {
    const services     = Array.isArray(v.services) ? v.services : [];
    const servicesHtml = services.map(s => `
      <div class="visit-service-row">
        <span class="svc-name">${s.name}${s.qty > 1 ? ' x' + s.qty : ''}</span>
        <span class="svc-price">${formatMoney(s.price * (s.qty || 1))}</span>
      </div>`).join('');

    return `
      <div class="visit-card">
        <div class="visit-date">📅 ${formatDateShort(v.visit_date)}${v.visit_time ? ' в ' + v.visit_time : ''}</div>
        ${servicesHtml ? `<div class="visit-services">${servicesHtml}</div>` : ''}
        <div class="visit-total">
          <span>Итого</span>
          <span style="color:var(--success)">${formatMoney(v.amount)}</span>
        </div>
      </div>`;
  }).join('');
}

function newAppointmentForPatient() {
  if (!currentPatient) return;
  showAddPatientPage();
  setTimeout(() => {
    document.getElementById('patient-name').value  = currentPatient.name;
    document.getElementById('patient-phone').value = currentPatient.phone || '';
    if (currentPatient.age) document.getElementById('patient-age').value = currentPatient.age;
  }, 50);
}

async function confirmDeletePatient() {
  if (!currentPatient) return;
  if (!confirm(`Удалить пациента "${currentPatient.name}"?\nВсе данные будут удалены.`)) return;

  const { error } = await sb.from('patients').delete().eq('id', currentPatient.id);
  if (error) { showToast('Ошибка удаления: ' + error.message, 'error'); return; }

  showToast('Пациент удалён', 'success');
  showPage('page-dashboard');
  loadDashboard();
}

// ============================================================
// SETTINGS — SERVICES
// ============================================================
async function loadMyServices() {
  if (!currentProfile) return;
  const { data: services } = await sb
    .from('services')
    .select('*')
    .eq('dentist_id', currentProfile.id)
    .order('created_at', { ascending: false });

  myServices = services || [];
  renderMyServices(myServices);
}

function renderMyServices(services) {
  const container = document.getElementById('my-services-list');
  if (!services.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:20px 0;">
        <p>Нет услуг</p>
        <p style="font-size:12px;margin-top:4px;color:var(--text-muted)">Добавьте услуги ниже</p>
      </div>`;
    return;
  }
  container.innerHTML = services.map(s => `
    <div class="my-service-item">
      <div class="my-service-name">🦷 ${s.name}</div>
      <div class="my-service-price">${formatMoney(s.price)}</div>
      <button class="my-service-delete" onclick="deleteService('${s.id}')" title="Удалить">✕</button>
    </div>`).join('');
}

async function addMyService() {
  const name  = document.getElementById('new-service-name').value.trim();
  const price = parseFloat(document.getElementById('new-service-price').value);

  if (!name)                   { showToast('Введите название услуги', 'error'); return; }
  if (isNaN(price) || price < 0) { showToast('Введите корректную цену', 'error'); return; }

  const { error } = await sb.from('services').insert({
    dentist_id: currentProfile.id, name, price
  });
  if (error) { showToast('Ошибка: ' + error.message, 'error'); return; }

  document.getElementById('new-service-name').value  = '';
  document.getElementById('new-service-price').value = '';
  showToast('Услуга добавлена!', 'success');
  loadMyServices();
}

async function deleteService(serviceId) {
  if (!confirm('Удалить эту услугу?')) return;
  const { error } = await sb.from('services').delete().eq('id', serviceId);
  if (error) { showToast('Ошибка: ' + error.message, 'error'); return; }
  showToast('Услуга удалена', 'success');
  loadMyServices();
}

async function saveProfile() {
  const name  = document.getElementById('settings-name').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();
  if (!name) { showToast('Введите ваше имя', 'error'); return; }

  const { error } = await sb.from('profiles')
    .update({ full_name: name, phone: phone || null })
    .eq('id', currentProfile.id);

  if (error) { showToast('Ошибка: ' + error.message, 'error'); return; }

  currentProfile.full_name = name;
  currentProfile.phone     = phone;
  updateDentistHeader();
  showToast('Профиль сохранён!', 'success');
}

// ============================================================
// HELPERS
// ============================================================
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getDaysAgo(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function formatDaysAgo(days) {
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7)   return `${days} дн. назад`;
  if (days < 30)  return `${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
  return `${Math.floor(days / 365)} г. назад`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function formatMoney(amount) {
  return (parseFloat(amount) || 0).toLocaleString('ru-RU') + ' сом.';
}

// ===== TOAST =====
let toastTimeout = null;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = 'toast' + (type ? ' ' + type : '');
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ===== App State =====
let currentPage = 'page-patients';
let pageHistory = [];
let currentFilter = 'all';
let currentPatientId = null;
let editingPatientId = null;
let editingVisitId = null;
let patientPhoto = null;
let visitPhotos = [];
let allPatients = [];

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDatabase();
        await loadPatients();
    } catch (err) {
        console.error('Init error:', err);
        alert('Ошибка инициализации базы данных');
    }
});

function compressImage(file, maxDimension = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

function toggleCustomTreatment(val) {
    const wrapper = document.getElementById('custom-treatment-wrapper');
    if (val === 'custom') {
        wrapper.classList.remove('hidden');
        document.getElementById('patient-treatment-custom').focus();
    } else {
        wrapper.classList.add('hidden');
        document.getElementById('patient-treatment-custom').value = '';
    }
}


// ===== Navigation =====
function navigateTo(pageId, options = {}) {
    if (currentPage !== pageId) pageHistory.push(currentPage);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
    currentPage = pageId;

    const backBtn = document.getElementById('back-btn');
    const searchBtn = document.getElementById('search-toggle-btn');
    const fab = document.getElementById('fab-btn');
    const title = document.getElementById('header-title');

    if (pageId === 'page-patients') {
        backBtn.classList.add('hidden');
        searchBtn.classList.remove('hidden');
        fab.classList.remove('hidden');
        title.textContent = 'DentaCare';
    } else {
        backBtn.classList.remove('hidden');
        searchBtn.classList.add('hidden');
        fab.classList.add('hidden');
        closeSearch();
    }

    if (pageId === 'page-add-patient') {
        title.textContent = editingPatientId ? 'Редактировать' : 'Новый пациент';
        if (!editingPatientId) resetPatientForm();
    } else if (pageId === 'page-patient-detail') {
        title.textContent = 'Пациент';
    } else if (pageId === 'page-add-visit') {
        title.textContent = editingVisitId ? 'Редактировать визит' : 'Новый визит';
    }
    window.scrollTo(0, 0);
}

function goBack() {
    editingPatientId = null;
    editingVisitId = null;
    if (pageHistory.length > 0) {
        const prev = pageHistory.pop();
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(prev).classList.add('active');
        currentPage = prev;

        const backBtn = document.getElementById('back-btn');
        const searchBtn = document.getElementById('search-toggle-btn');
        const fab = document.getElementById('fab-btn');
        const title = document.getElementById('header-title');

        if (prev === 'page-patients') {
            backBtn.classList.add('hidden');
            searchBtn.classList.remove('hidden');
            fab.classList.remove('hidden');
            title.textContent = 'DentaCare';
            loadPatients();
        } else if (prev === 'page-patient-detail') {
            backBtn.classList.remove('hidden');
            searchBtn.classList.add('hidden');
            fab.classList.add('hidden');
            title.textContent = 'Пациент';
            if (currentPatientId) showPatientDetail(currentPatientId);
        }
    }
}

function setActiveNav(btn) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
}

// ===== Search =====
function toggleSearch() {
    const bar = document.getElementById('search-bar');
    bar.classList.toggle('hidden');
    bar.classList.toggle('visible');
    if (!bar.classList.contains('hidden')) {
        document.getElementById('search-input').focus();
    }
}
function closeSearch() {
    const bar = document.getElementById('search-bar');
    bar.classList.add('hidden');
    bar.classList.remove('visible');
    document.getElementById('search-input').value = '';
}
function clearSearch() {
    document.getElementById('search-input').value = '';
    renderPatients(allPatients);
}
function searchPatients(query) {
    const q = query.toLowerCase().trim();
    if (!q) { renderFilteredPatients(); return; }
    const filtered = allPatients.filter(p =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
    );
    renderPatients(filtered);
}

// ===== Load & Render Patients =====
async function loadPatients() {
    allPatients = await getAllPatients();
    allPatients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    updateStats();
    renderFilteredPatients();
}

function updateStats() {
    const total = allPatients.length;
    const active = allPatients.filter(p => p.status === 'active').length;
    const completed = allPatients.filter(p => p.status === 'completed').length;
    let totalRevenue = 0;
    allPatients.forEach(p => { totalRevenue += parseFloat(p.paid) || 0; });

    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.textContent = total;

    const activeEl = document.getElementById('stat-active');
    if (activeEl) activeEl.textContent = active;

    const completedEl = document.getElementById('stat-completed');
    if (completedEl) completedEl.textContent = completed;

    const revenueEl = document.getElementById('stat-revenue');
    if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);
}

function filterPatients(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderFilteredPatients();
}

function renderFilteredPatients() {
    let filtered = allPatients;
    if (currentFilter === 'active') filtered = allPatients.filter(p => p.status === 'active');
    else if (currentFilter === 'completed') filtered = allPatients.filter(p => p.status === 'completed');
    renderPatients(filtered);
}

function renderPatients(patients) {
    const list = document.getElementById('patients-list');
    const empty = document.getElementById('empty-state');
    if (patients.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    list.innerHTML = patients.map(p => {
        let avatarContent = '';
        if (p.photo) {
            avatarContent = `<img src="${p.photo}" alt="${p.firstName}">`;
        } else {
            avatarContent = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:100%;height:100%;color:#6366f1;padding:8px;background:rgba(99,102,241,0.08);border-radius:50%">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>`;
        }
        const statusClass = p.status === 'active' ? 'status-active' : 'status-completed';
        const statusText = p.status === 'active' ? 'Активный' : 'Завершён';
        const age = calculateAge(p.birthDate);
        return `
            <div class="patient-card" onclick="showPatientDetail('${p.id}')">
                <div class="patient-avatar">${avatarContent}</div>
                <div class="patient-info">
                    <div class="patient-name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</div>
                    <div class="patient-meta">
                        <span>${age} лет</span>
                        ${p.phone ? `<span>${escapeHtml(p.phone)}</span>` : ''}
                    </div>
                </div>
                <span class="patient-status ${statusClass}">${statusText}</span>
            </div>`;
    }).join('');
}

// ===== Patient Form =====
function resetPatientForm() {
    document.getElementById('patient-firstname').value = '';
    document.getElementById('patient-lastname').value = '';
    document.getElementById('patient-age').value = '';
    document.getElementById('patient-phone').value = '';
    document.getElementById('patient-referral').value = '';
    
    // Default visit date to today
    document.getElementById('patient-visit-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('patient-visit-date-group').classList.remove('hidden');
    
    document.getElementById('patient-treatment-type').value = '';
    document.getElementById('patient-treatment-custom').value = '';
    document.getElementById('custom-treatment-wrapper').classList.add('hidden');
    document.getElementById('analysis-none').checked = true;
    document.getElementById('patient-total-cost').value = '';
    document.getElementById('patient-notes').value = '';
    patientPhoto = null;
    const preview = document.getElementById('photo-preview');
    preview.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        <span>Нажмите для загрузки</span>`;
    document.getElementById('form-title').textContent = 'Новый пациент';
    document.getElementById('save-patient-btn').innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        Сохранить пациента`;
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        showToast('Обработка фото...');
        patientPhoto = await compressImage(file, 1024);
        document.getElementById('photo-preview').innerHTML = `<img src="${patientPhoto}" alt="Фото">`;
    } catch (err) {
        console.error('Error uploading photo:', err);
        showToast('Ошибка при загрузке фото');
    }
}

async function savePatient() {
    const firstName = document.getElementById('patient-firstname').value.trim();
    const lastName = document.getElementById('patient-lastname').value.trim();
    const ageVal = parseInt(document.getElementById('patient-age').value) || 0;
    
    // Convert age to birth year to keep database schema compatible
    const birthDate = String(new Date().getFullYear() - ageVal);
    
    const phone = document.getElementById('patient-phone').value.trim();
    const referral = document.getElementById('patient-referral').value.trim();
    const visitDate = document.getElementById('patient-visit-date').value;
    const selectedTreatment = document.getElementById('patient-treatment-type').value;
    const customTreatment = document.getElementById('patient-treatment-custom').value.trim();
    const treatmentType = selectedTreatment === 'custom' ? customTreatment : selectedTreatment;
    
    // Get radio value
    let analysis = 'none';
    const selectedAnalysis = document.querySelector('input[name="patient-analysis"]:checked');
    if (selectedAnalysis) {
        analysis = selectedAnalysis.value;
    }
    
    const totalCost = parseFloat(document.getElementById('patient-total-cost').value) || 0;
    const paid = totalCost; // set paid = totalCost since we only show one main sum
    const notes = document.getElementById('patient-notes').value.trim();

    if (!firstName || !lastName || !ageVal) {
        showToast('Заполните обязательные поля');
        return;
    }

    const patientData = { 
        firstName, 
        lastName, 
        birthDate, 
        phone, 
        referral,
        treatmentType,
        analysis,
        paid,
        totalCost,
        notes, 
        photo: patientPhoto, 
        status: 'active' 
    };

    try {
        if (editingPatientId) {
            const existing = await getPatient(editingPatientId);
            patientData.id = editingPatientId;
            patientData.createdAt = existing.createdAt;
            patientData.status = existing.status;
            if (!patientPhoto && existing.photo) patientData.photo = existing.photo;
            await updatePatient(patientData);
            showToast('Пациент обновлён');
            editingPatientId = null;
            currentPatientId = patientData.id;
            await loadPatients();
            showPatientDetail(patientData.id);
            pageHistory = ['page-patients'];
        } else {
            const newPatient = await addPatient(patientData);
            
            // Automatically create initial visit representing registration/first treatment
            const treatmentTypesRu = {
                karies: 'Лечение кариеса',
                endodontics: 'Эндодонтия',
                cleaning: 'Профилактическая чистка',
                orthopedics: 'Ортопедия',
                surgery: 'Хирургия'
            };
            const treatmentLabel = treatmentTypesRu[treatmentType] || (treatmentType || 'Первичный прием');
            
            const initialVisit = {
                patientId: newPatient.id,
                date: visitDate || new Date().toISOString().split('T')[0],
                procedures: [{ name: treatmentLabel, cost: totalCost }],
                totalCost: totalCost,
                paidAmount: totalCost,
                photos: patientPhoto ? [patientPhoto] : [],
                notes: notes || 'Первичный прием'
            };
            await addVisit(initialVisit);

            showToast('Пациент добавлен');
            await loadPatients();
            showPatientDetail(newPatient.id);
            pageHistory = ['page-patients'];
        }
    } catch (err) {
        console.error(err);
        showToast('Ошибка сохранения');
    }
}

// ===== Patient Detail =====
async function showPatientDetail(id) {
    currentPatientId = id;
    const patient = await getPatient(id);
    if (!patient) { showToast('Пациент не найден'); return; }
    const visits = await getVisitsByPatient(id);

    let totalSpent = 0;
    visits.forEach(v => { totalSpent += v.totalCost || 0; });

    let avatarContent = '';
    if (patient.photo) {
        avatarContent = `<img src="${patient.photo}" alt="${patient.firstName}">`;
    } else {
        avatarContent = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:100%;height:100%;color:#6366f1;padding:12px;background:rgba(99,102,241,0.08);border-radius:50%">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
        </svg>`;
    }
    const age = calculateAge(patient.birthDate);
    const statusClass = patient.status === 'active' ? 'status-active' : 'status-completed';
    const statusText = patient.status === 'active' ? 'Активный' : 'Завершён';
    const toggleStatusText = patient.status === 'active' ? 'Завершить' : 'Активировать';
    const toggleStatusBtn = patient.status === 'active' ? 'btn-success' : 'btn-outline';

    const treatmentTypesRu = {
        karies: 'Лечение кариеса',
        endodontics: 'Эндодонтия',
        cleaning: 'Профилактическая чистка',
        orthopedics: 'Ортопедия',
        surgery: 'Хирургия'
    };

    let analysisBadge = '';
    if (patient.analysis === 'positive' || patient.analysis === 'healthy') {
        analysisBadge = '<span class="patient-status status-completed" style="margin-top:8px;margin-left:4px;display:inline-flex">Анализ: Здоров</span>';
    } else if (patient.analysis === 'negative' || patient.analysis === 'sick') {
        analysisBadge = '<span class="patient-status" style="margin-top:8px;margin-left:4px;display:inline-flex;background:var(--danger-bg);color:var(--danger)">Анализ: Болен</span>';
    }

    let additionalInfo = '';
    if (patient.referral) {
        additionalInfo += `<div><strong>Откуда пришёл:</strong> ${escapeHtml(patient.referral)}</div>`;
    }
    if (patient.treatmentType) {
        const presetLabel = treatmentTypesRu[patient.treatmentType];
        additionalInfo += `<div><strong>Тип лечения:</strong> ${presetLabel || escapeHtml(patient.treatmentType)}</div>`;
    }
    if (patient.notes) {
        additionalInfo += `<div><strong>Заметки:</strong> ${escapeHtml(patient.notes)}</div>`;
    }
    if (additionalInfo) {
        additionalInfo = `<div class="detail-notes-block" style="text-align:left;line-height:1.6">${additionalInfo}</div>`;
    }

    const totalAmt = patient.totalCost || 0;

    let html = `
        <div class="detail-header">
            <div class="detail-avatar">${avatarContent}</div>
            <div class="detail-name">${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</div>
            <div class="detail-birth">📅 ${formatDate(patient.birthDate)} (${age} лет)</div>
            ${patient.phone ? `<div class="detail-phone">📞 ${escapeHtml(patient.phone)}</div>` : ''}
            <div style="display:flex;justify-content:center;gap:4px;flex-wrap:wrap">
                <span class="patient-status ${statusClass}" style="margin-top:8px;display:inline-flex">${statusText}</span>
                ${analysisBadge}
            </div>
            ${additionalInfo}
        </div>

        <div class="detail-actions">
            <button class="btn ${toggleStatusBtn} btn-sm" onclick="togglePatientStatus('${patient.id}')">
                ${toggleStatusText}
            </button>
            <button class="btn btn-secondary btn-sm" onclick="editPatient('${patient.id}')">✏️ Редакт.</button>
            <button class="btn btn-secondary btn-sm" onclick="printPatient('${patient.id}')">📄 Печать</button>
            <button class="btn btn-secondary btn-sm" onclick="sharePatientAsImage('${patient.id}')">📸 В Фото</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeletePatient('${patient.id}')">🗑️</button>
        </div>

        <div class="detail-total" style="padding:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--text-secondary);font-size:14px">Общая сумма:</span>
            <span style="font-weight:800;color:var(--success);font-size:20px">${formatCurrency(totalAmt)}</span>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 class="detail-section-title" style="margin-bottom:0">📋 История визитов (${visits.length})</h3>
            <button class="btn btn-primary btn-sm" onclick="openAddVisit('${patient.id}')">+ Визит</button>
        </div>`;

    if (visits.length === 0) {
        html += `<div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><h3>Нет визитов</h3><p>Нажмите «+ Визит» чтобы добавить</p></div>`;
    } else {
        visits.forEach(v => {
            html += `<div class="visit-card">
                <div class="visit-header">
                    <span class="visit-date">📅 ${formatDate(v.date)}</span>
                    <span class="visit-cost">${formatCurrency(v.totalCost || 0)}</span>
                </div>
                <div class="visit-procedures">`;
            if (v.procedures && v.procedures.length) {
                v.procedures.forEach(proc => {
                    html += `<div class="visit-procedure-item">
                        <span class="visit-procedure-name">${escapeHtml(proc.name)}</span>
                        <span class="visit-procedure-cost">${formatCurrency(proc.cost || 0)}</span>
                    </div>`;
                });
            }
            html += `</div>`;
            if (v.notes) html += `<div class="visit-notes">📝 ${escapeHtml(v.notes)}</div>`;
            if (v.photos && v.photos.length) {
                html += `<div class="visit-photos">`;
                v.photos.forEach(photo => {
                    html += `<div class="visit-photo-thumb" onclick="event.stopPropagation();openPhotoViewer('${photo}')"><img src="${photo}" alt="Фото визита"></div>`;
                });
                html += `</div>`;
            }
            html += `<div class="visit-actions">
                <button class="btn btn-secondary btn-sm" onclick="editVisit('${patient.id}','${v.id}')">✏️ Редакт.</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteVisit('${v.id}','${patient.id}')">🗑️ Удалить</button>
            </div></div>`;
        });
    }

    document.getElementById('patient-detail-content').innerHTML = html;
    navigateTo('page-patient-detail');
}

async function togglePatientStatus(id) {
    const patient = await getPatient(id);
    patient.status = patient.status === 'active' ? 'completed' : 'active';
    await updatePatient(patient);
    showToast(patient.status === 'active' ? 'Пациент активирован' : 'Лечение завершено');
    await loadPatients();
    showPatientDetail(id);
    pageHistory = pageHistory.filter(p => p !== 'page-patient-detail');
}

async function editPatient(id) {
    const patient = await getPatient(id);
    editingPatientId = id;
    document.getElementById('patient-firstname').value = patient.firstName;
    document.getElementById('patient-lastname').value = patient.lastName;
    // Calculate age from birthDate
    const age = calculateAge(patient.birthDate);
    document.getElementById('patient-age').value = age > 0 ? age : '';
    
    // Hide visit date input when editing (since visit is already logged)
    document.getElementById('patient-visit-date-group').classList.add('hidden');
    
    document.getElementById('patient-phone').value = patient.phone || '';
    document.getElementById('patient-referral').value = patient.referral || '';
    // Restore custom treatment or preset
    const presetVals = ['karies','endodontics','cleaning','orthopedics','surgery',''];
    if (patient.treatmentType && !presetVals.includes(patient.treatmentType)) {
        document.getElementById('patient-treatment-type').value = 'custom';
        document.getElementById('patient-treatment-custom').value = patient.treatmentType;
        document.getElementById('custom-treatment-wrapper').classList.remove('hidden');
    } else {
        document.getElementById('patient-treatment-type').value = patient.treatmentType || '';
        document.getElementById('custom-treatment-wrapper').classList.add('hidden');
    }
    
    // Set radio analysis
    let analysisVal = patient.analysis || 'none';
    if (analysisVal === 'positive') analysisVal = 'healthy';
    if (analysisVal === 'negative') analysisVal = 'sick';
    const radioElem = document.getElementById(`analysis-${analysisVal}`);
    if (radioElem) radioElem.checked = true;
    
    document.getElementById('patient-total-cost').value = patient.totalCost !== undefined ? patient.totalCost : '';

    document.getElementById('patient-notes').value = patient.notes || '';
    patientPhoto = patient.photo || null;
    if (patient.photo) {
        document.getElementById('photo-preview').innerHTML = `<img src="${patient.photo}" alt="Фото">`;
    }
    document.getElementById('form-title').textContent = 'Редактировать пациента';
    navigateTo('page-add-patient');
}

function confirmDeletePatient(id) {
    showDialog('Удалить пациента?', 'Все данные пациента и его визиты будут удалены безвозвратно.', async () => {
        await deletePatient(id);
        showToast('Пациент удалён');
        await loadPatients();
        pageHistory = [];
        navigateTo('page-patients');
    });
}

// ===== Visits =====
function openAddVisit(patientId) {
    currentPatientId = patientId;
    editingVisitId = null;
    document.getElementById('visit-form-title').textContent = 'Новый визит';
    document.getElementById('visit-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('visit-notes').value = '';
    visitPhotos = [];
    renderVisitPhotosGrid();
    const procList = document.getElementById('procedures-list');
    procList.innerHTML = '';
    addProcedureField();
    updateTotalCost();
    navigateTo('page-add-visit');
}

async function editVisit(patientId, visitId) {
    currentPatientId = patientId;
    editingVisitId = visitId;
    const visits = await getVisitsByPatient(patientId);
    const visit = visits.find(v => v.id === visitId);
    if (!visit) return;

    document.getElementById('visit-form-title').textContent = 'Редактировать визит';
    document.getElementById('visit-date').value = visit.date;
    document.getElementById('visit-notes').value = visit.notes || '';
    visitPhotos = visit.photos ? [...visit.photos] : [];
    renderVisitPhotosGrid();

    const procList = document.getElementById('procedures-list');
    procList.innerHTML = '';
    if (visit.procedures && visit.procedures.length) {
        visit.procedures.forEach(proc => addProcedureField(proc.name, proc.cost));
    } else {
        addProcedureField();
    }
    updateTotalCost();
    navigateTo('page-add-visit');
}

function addProcedureField(name = '', cost = '') {
    const list = document.getElementById('procedures-list');
    const div = document.createElement('div');
    div.className = 'procedure-item';
    div.innerHTML = `
        <input type="text" class="form-input procedure-name" placeholder="Название процедуры" value="${escapeHtml(String(name))}">
        <input type="number" class="form-input procedure-cost" placeholder="Цена" value="${cost}" oninput="updateTotalCost()">
        <button class="procedure-remove" onclick="this.parentElement.remove();updateTotalCost()">✕</button>`;
    list.appendChild(div);
}

function updateTotalCost() {
    const costs = document.querySelectorAll('.procedure-cost');
    let total = 0;
    costs.forEach(input => { total += parseFloat(input.value) || 0; });
    document.getElementById('total-cost-value').textContent = formatCurrency(total);
}

async function handleVisitPhotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    showToast('Обработка фото...');
    for (let i = 0; i < files.length; i++) {
        try {
            const compressed = await compressImage(files[i], 1024);
            visitPhotos.push(compressed);
        } catch (err) {
            console.error('Error compressing visit photo:', err);
        }
    }
    renderVisitPhotosGrid();
    event.target.value = '';
}

function renderVisitPhotosGrid() {
    const grid = document.getElementById('visit-photos-grid');
    let html = '';
    visitPhotos.forEach((photo, i) => {
        html += `<div class="visit-photo-item">
            <img src="${photo}" alt="Фото ${i + 1}">
            <button class="remove-photo" onclick="removeVisitPhoto(${i})">✕</button>
        </div>`;
    });
    html += `<div class="visit-photo-add" onclick="document.getElementById('visit-photo-input').click()">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Добавить фото</span>
    </div>`;
    grid.innerHTML = html;
}

function removeVisitPhoto(index) {
    visitPhotos.splice(index, 1);
    renderVisitPhotosGrid();
}

async function saveVisit() {
    const date = document.getElementById('visit-date').value;
    if (!date) { showToast('Выберите дату визита'); return; }

    const procItems = document.querySelectorAll('.procedure-item');
    const procedures = [];
    let totalCost = 0;
    procItems.forEach(item => {
        const name = item.querySelector('.procedure-name').value.trim();
        const cost = parseFloat(item.querySelector('.procedure-cost').value) || 0;
        if (name) {
            procedures.push({ name, cost });
            totalCost += cost;
        }
    });

    const notes = document.getElementById('visit-notes').value.trim();
    const visitData = { patientId: currentPatientId, date, procedures, totalCost, photos: visitPhotos, notes };

    try {
        if (editingVisitId) {
            visitData.id = editingVisitId;
            await updateVisit(visitData);
            showToast('Визит обновлён');
            editingVisitId = null;
        } else {
            await addVisit(visitData);
            showToast('Визит добавлен');
        }
        await loadPatients();
        showPatientDetail(currentPatientId);
        pageHistory = pageHistory.filter(p => p !== 'page-add-visit');
    } catch (err) {
        console.error(err);
        showToast('Ошибка сохранения визита');
    }
}

function confirmDeleteVisit(visitId, patientId) {
    showDialog('Удалить визит?', 'Данные визита будут удалены безвозвратно.', async () => {
        await deleteVisit(visitId);
        showToast('Визит удалён');
        await loadPatients();
        showPatientDetail(patientId);
    });
}

// ===== PDF / Print Report =====
async function printPatient(id) {
    showToast('Формирование отчёта...');
    const patient = await getPatient(id);
    const visits = await getVisitsByPatient(id);

    const treatmentTypesRu = {
        karies: 'Лечение кариеса',
        endodontics: 'Эндодонтия',
        cleaning: 'Профилактическая чистка',
        orthopedics: 'Ортопедия',
        surgery: 'Хирургия'
    };
    const an = patient.analysis || 'none';
    const analysisLabel = (an === 'healthy' || an === 'positive') ? 'Здоров' : (an === 'sick' || an === 'negative') ? 'Болен' : 'Не указано';
    const analysisBadgeClass = (an === 'healthy' || an === 'positive') ? 'badge-pos' : (an === 'sick' || an === 'negative') ? 'badge-neg' : 'badge-none';

    const totalAmt = patient.totalCost || 0;
    const treatmentLabel = treatmentTypesRu[patient.treatmentType] || (patient.treatmentType || '—');

    // Build visits table rows
    let visitsRows = '';
    if (visits.length === 0) {
        visitsRows = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-style:italic">Визиты отсутствуют</td></tr>';
    } else {
        visits.forEach((v, idx) => {
            const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
            const procs = v.procedures && v.procedures.length
                ? v.procedures.map(p => `${escapeHtml(p.name)} — ${formatCurrency(p.cost || 0)}`).join('<br>')
                : '<span style="color:#9ca3af">—</span>';
            const noteStr = v.notes ? `<br><em style="color:#6b7280;font-size:11px">📝 ${escapeHtml(v.notes)}</em>` : '';
            visitsRows += `<tr style="background:${bg};border-bottom:1px solid #e5e7eb">
                <td style="padding:10px 12px;font-size:13px;white-space:nowrap;vertical-align:top">${formatDate(v.date)}</td>
                <td style="padding:10px 12px;font-size:13px">${procs}${noteStr}</td>
                <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:700;color:#059669;vertical-align:top">${formatCurrency(v.totalCost || 0)}</td>
            </tr>`;
        });
    }

    const photoHtml = patient.photo
        ? `<img src="${patient.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.4);margin-right:20px">`
        : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;margin-right:20px"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" style="width:48px;height:48px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Safia Dent — ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f0f4ff; color:#1f2937; }
  .page { width:210mm; min-height:297mm; margin:0 auto; background:#fff; box-shadow:0 0 40px rgba(0,0,0,0.15); }

  /* Header */
  .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6c63ff 100%); padding:30px 36px; color:white; position:relative; overflow:hidden; }
  .header::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; border-radius:50%; background:rgba(255,255,255,0.08); }
  .header::after  { content:''; position:absolute; bottom:-60px; left:60px; width:150px; height:150px; border-radius:50%; background:rgba(255,255,255,0.06); }
  .header-top { display:flex; align-items:center; justify-content:space-between; position:relative; z-index:1; }
  .header-brand { display:flex; align-items:center; }
  .brand-text h1 { font-size:28px; font-weight:800; letter-spacing:2px; }
  .brand-text p  { font-size:13px; opacity:0.85; margin-top:2px; }
  .header-meta { text-align:right; font-size:12px; opacity:0.85; }
  .header-meta strong { display:block; font-size:14px; opacity:1; }
  .patient-bar { display:flex; align-items:center; margin-top:24px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.25); position:relative; z-index:1; }
  .patient-bar-info h2 { font-size:20px; font-weight:700; }
  .patient-bar-info p  { font-size:13px; opacity:0.85; margin-top:3px; }

  /* Finance card */
  .finance-single { border:1px solid #e5e7eb; border-radius:12px; margin:24px 36px; padding:20px 24px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; }
  .finance-single .label { font-size:12px; text-transform:uppercase; font-weight:600; color:#6b7280; letter-spacing:0.5px; }
  .finance-single .value { font-size:24px; font-weight:800; color:#059669; }

  /* Info section */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:0 36px 24px; }
  .info-box { border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
  .info-box h3 { font-size:12px; font-weight:700; text-transform:uppercase; color:#6b7280; letter-spacing:0.5px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #e5e7eb; }
  .info-row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
  .info-row .key { color:#6b7280; }
  .info-row .val { font-weight:600; color:#111827; text-align:right; max-width:55%; }

  /* Visits table */
  .section { margin:0 36px 24px; }
  .section-title { font-size:13px; font-weight:700; text-transform:uppercase; color:#4f46e5; letter-spacing:0.5px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #4f46e5; }
  table { width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
  thead tr { background: linear-gradient(135deg,#4f46e5,#7c3aed); color:white; }
  th { padding:11px 12px; text-align:left; font-size:12px; font-weight:600; letter-spacing:0.3px; }
  th:last-child { text-align:right; }

  /* Footer */
  .footer { margin:24px 36px 36px; padding-top:16px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:11px; color:#9ca3af; }

  /* Analysis badge */
  .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
  .badge-pos { background:#d1fae5; color:#065f46; }
  .badge-neg { background:#fee2e2; color:#991b1b; }
  .badge-none{ background:#f3f4f6; color:#6b7280; }

  @media print {
    body { background: #fff; }
    .page { box-shadow: none; width:100%; }
    @page { margin:0; size: A4; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-top">
      <div class="header-brand">
        <div class="brand-text">
          <h1>🦷 SAFIA DENT</h1>
          <p>Доктор: Шукуров Азам</p>
        </div>
      </div>
      <div class="header-meta">
        МЕДИЦИНСКАЯ КАРТА
        <strong>Дата: ${new Date().toLocaleDateString('ru-RU')}</strong>
      </div>
    </div>
    <div class="patient-bar">
      ${photoHtml}
      <div class="patient-bar-info">
        <h2>${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</h2>
        <p>📅 ${formatDate(patient.birthDate)} · ${calculateAge(patient.birthDate)} лет${patient.phone ? ' · 📞 ' + escapeHtml(patient.phone) : ''}</p>
      </div>
    </div>
  </div>

  <!-- FINANCE SINGLE -->
  <div class="finance-single">
    <div class="label">Общая сумма</div>
    <div class="value">${formatCurrency(totalAmt)}</div>
  </div>

  <!-- INFO GRID -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Персональные данные</h3>
      <div class="info-row"><span class="key">Статус лечения</span><span class="val">${patient.status === 'active' ? '🟡 Активный' : '🟢 Завершён'}</span></div>
      <div class="info-row"><span class="key">Анализы</span><span class="val">
        <span class="badge ${analysisBadgeClass}">${analysisLabel}</span>
      </span></div>
      <div class="info-row"><span class="key">Тип лечения</span><span class="val">${escapeHtml(treatmentLabel)}</span></div>
    </div>
    <div class="info-box">
      <h3>Заметки врача</h3>
      <p style="font-size:13px;color:#374151;line-height:1.6">${escapeHtml(patient.notes || 'Нет заметок')}</p>
    </div>
  </div>

  <!-- VISITS TABLE -->
  <div class="section">
    <div class="section-title">📋 История посещений (${visits.length})</div>
    <table>
      <thead><tr>
        <th style="width:110px">Дата</th>
        <th>Процедуры</th>
        <th style="width:130px;text-align:right">Стоимость</th>
      </tr></thead>
      <tbody>${visitsRows}</tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>Клиника Safia Dent · Доктор Шукуров Азам</span>
    <span>Сформировано: ${new Date().toLocaleDateString('ru-RU', {day:'2-digit',month:'long',year:'numeric'})}</span>
  </div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { showToast('Разрешите всплывающие окна'); return; }
    win.document.write(html);
    win.document.close();
}
async function sharePatientAsImage(id) {
    showToast('Генерация изображения...');
    try {
        const patient = await getPatient(id);
        const visits = await getVisitsByPatient(id);

        const treatmentTypesRu = {
            karies: 'Лечение кариеса',
            endodontics: 'Эндодонтия',
            cleaning: 'Профилактическая чистка',
            orthopedics: 'Ортопедия',
            surgery: 'Хирургия'
        };
        const an = patient.analysis || 'none';
        const analysisLabel = (an === 'healthy' || an === 'positive') ? 'Здоров' : (an === 'sick' || an === 'negative') ? 'Болен' : 'Не указано';
        const analysisBadgeClass = (an === 'healthy' || an === 'positive') ? 'badge-pos' : (an === 'sick' || an === 'negative') ? 'badge-neg' : 'badge-none';
        const totalAmt = patient.totalCost || 0;
        const treatmentLabel = treatmentTypesRu[patient.treatmentType] || (patient.treatmentType || '—');

        // Build visits table rows
        let visitsRows = '';
        if (visits.length === 0) {
            visitsRows = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-style:italic">Визиты отсутствуют</td></tr>';
        } else {
            visits.forEach((v, idx) => {
                const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
                const procs = v.procedures && v.procedures.length
                    ? v.procedures.map(p => `${escapeHtml(p.name)} — ${formatCurrency(p.cost || 0)}`).join('<br>')
                    : '<span style="color:#9ca3af">—</span>';
                const noteStr = v.notes ? `<br><em style="color:#6b7280;font-size:11px">📝 ${escapeHtml(v.notes)}</em>` : '';
                visitsRows += `<tr style="background:${bg};border-bottom:1px solid #e5e7eb">
                    <td style="padding:10px 12px;font-size:13px;white-space:nowrap;vertical-align:top">${formatDate(v.date)}</td>
                    <td style="padding:10px 12px;font-size:13px">${procs}${noteStr}</td>
                    <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:700;color:#059669;vertical-align:top">${formatCurrency(v.totalCost || 0)}</td>
                </tr>`;
            });
        }

        const photoHtml = patient.photo
            ? `<img src="${patient.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.4);margin-right:20px">`
            : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;margin-right:20px"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" style="width:48px;height:48px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;

        const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#ffffff; color:#1f2937; padding: 20px; }
  .page { width:100%; max-width:800px; margin:0 auto; background:#fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }

  /* Header */
  .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6c63ff 100%); padding:30px 36px; color:white; position:relative; overflow:hidden; }
  .header::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; border-radius:50%; background:rgba(255,255,255,0.08); }
  .header::after  { content:''; position:absolute; bottom:-60px; left:60px; width:150px; height:150px; border-radius:50%; background:rgba(255,255,255,0.06); }
  .header-top { display:flex; align-items:center; justify-content:space-between; position:relative; z-index:1; }
  .header-brand { display:flex; align-items:center; }
  .brand-text h1 { font-size:28px; font-weight:800; letter-spacing:2px; }
  .brand-text p  { font-size:13px; opacity:0.85; margin-top:2px; }
  .header-meta { text-align:right; font-size:12px; opacity:0.85; }
  .header-meta strong { display:block; font-size:14px; opacity:1; }
  .patient-bar { display:flex; align-items:center; margin-top:24px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.25); position:relative; z-index:1; }
  .patient-bar-info h2 { font-size:20px; font-weight:700; }
  .patient-bar-info p  { font-size:13px; opacity:0.85; margin-top:3px; }

  /* Finance card */
  .finance-single { border:1px solid #e5e7eb; border-radius:12px; margin:24px 36px; padding:20px 24px; display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; }
  .finance-single .label { font-size:12px; text-transform:uppercase; font-weight:600; color:#6b7280; letter-spacing:0.5px; }
  .finance-single .value { font-size:24px; font-weight:800; color:#059669; }

  /* Info section */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:0 36px 24px; }
  .info-box { border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
  .info-box h3 { font-size:12px; font-weight:700; text-transform:uppercase; color:#6b7280; letter-spacing:0.5px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #e5e7eb; }
  .info-row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
  .info-row .key { color:#6b7280; }
  .info-row .val { font-weight:600; color:#111827; text-align:right; max-width:55%; }

  /* Visits table */
  .section { margin:0 36px 24px; }
  .section-title { font-size:13px; font-weight:700; text-transform:uppercase; color:#4f46e5; letter-spacing:0.5px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #4f46e5; }
  table { width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
  thead tr { background: linear-gradient(135deg,#4f46e5,#7c3aed); color:white; }
  th { padding:11px 12px; text-align:left; font-size:12px; font-weight:600; letter-spacing:0.3px; }
  th:last-child { text-align:right; }

  /* Footer */
  .footer { margin:24px 36px 36px; padding-top:16px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-size:11px; color:#9ca3af; }

  /* Analysis badge */
  .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
  .badge-pos { background:#d1fae5; color:#065f46; }
  .badge-neg { background:#fee2e2; color:#991b1b; }
  .badge-none{ background:#f3f4f6; color:#6b7280; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-top">
      <div class="header-brand">
        <div class="brand-text">
          <h1>🦷 SAFIA DENT</h1>
          <p>Доктор: Шукуров Азам</p>
        </div>
      </div>
      <div class="header-meta">
        МЕДИЦИНСКАЯ КАРТА
        <strong>Дата: \${new Date().toLocaleDateString('ru-RU')}</strong>
      </div>
    </div>
    <div class="patient-bar">
      \${photoHtml}
      <div class="patient-bar-info">
        <h2>\${escapeHtml(patient.firstName)} \${escapeHtml(patient.lastName)}</h2>
        <p>📅 \${formatDate(patient.birthDate)} · \${calculateAge(patient.birthDate)} лет\${patient.phone ? ' · 📞 ' + escapeHtml(patient.phone) : ''}</p>
      </div>
    </div>
  </div>

  <!-- FINANCE SINGLE -->
  <div class="finance-single">
    <div class="label">Общая сумма</div>
    <div class="value">\${formatCurrency(totalAmt)}</div>
  </div>

  <!-- INFO GRID -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Персональные данные</h3>
      <div class="info-row"><span class="key">Статус лечения</span><span class="val">\${patient.status === 'active' ? '🟡 Активный' : '🟢 Завершён'}</span></div>
      <div class="info-row"><span class="key">Анализы</span><span class="val">
        <span class="badge \${patient.analysis === 'positive' ? 'badge-pos' : patient.analysis === 'negative' ? 'badge-neg' : 'badge-none'}"\>\${analysisRu[patient.analysis || 'none']}</span>
      </span></div>
      <div class="info-row"><span class="key">Тип лечения</span><span class="val">\${escapeHtml(treatmentLabel)}</span></div>
    </div>
    <div class="info-box">
      <h3>Заметки врача</h3>
      <p style="font-size:13px;color:#374151;line-height:1.6">\${escapeHtml(patient.notes || 'Нет заметок')}</p>
    </div>
  </div>

  <!-- VISITS TABLE -->
  <div class="section">
    <div class="section-title">📋 История посещений (\${visits.length})</div>
    <table>
      <thead><tr>
        <th style="width:110px">Дата</th>
        <th>Процедуры</th>
        <th style="width:130px;text-align:right">Стоимость</th>
      </tr></thead>
      <tbody>\${visitsRows}</tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>Клиника Safia Dent · Доктор Шукуров Азам</span>
    <span>Сформировано: \${new Date().toLocaleDateString('ru-RU', {day:'2-digit',month:'long',year:'numeric'})}</span>
  </div>
</div>
</body>
</html>`;

        // Render to image
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '-9999px';
        iframe.style.width = '800px';
        iframe.style.height = '1400px';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        // Wait a bit for font loading and rendering
        await new Promise(resolve => setTimeout(resolve, 800));

        // Adjust iframe height to fit content fully without scrolling
        const body = doc.body;
        const htmlElement = doc.documentElement;
        const height = Math.max(body.scrollHeight, body.offsetHeight, htmlElement.clientHeight, htmlElement.scrollHeight, htmlElement.offsetHeight);
        iframe.style.height = height + 'px';

        const element = doc.querySelector('.page');

        if (typeof html2canvas === 'undefined') {
            throw new Error('Библиотека html2canvas не загружена. Проверьте подключение к интернету.');
        }

        const canvas = await html2canvas(element, {
            useCORS: true,
            scale: 2, // High resolution
            backgroundColor: '#ffffff'
        });

        document.body.removeChild(iframe);

        // Convert to Blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const fileName = `Safia_Dent_${patient.firstName}_${patient.lastName}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // Share via Web Share API if supported
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `Медицинская карта: ${patient.firstName} ${patient.lastName}`,
                text: `Отчёт клиники Safia Dent для пациента ${patient.firstName} ${patient.lastName}`
            });
            showToast('Отчёт успешно отправлен');
        } else {
            // Fallback: Open image in photo viewer
            const dataUrl = canvas.toDataURL('image/png');
            openPhotoViewer(dataUrl);
            showToast('Удерживайте палец на фото, чтобы сохранить его');
        }
    } catch (err) {
        console.error(err);
        showToast('Ошибка при генерации изображения');
    }
}

// ===== Stats Page =====
function showStats() {
    navigateTo('page-patients');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Photo Viewer =====
function openPhotoViewer(src) {
    const img = document.getElementById('photo-viewer-img');
    img.src = src;
    const dl = document.getElementById('photo-viewer-download');
    if (dl) {
        dl.href = src;
        dl.style.display = 'inline-block';
    }
    document.getElementById('photo-viewer').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closePhotoViewer() {
    document.getElementById('photo-viewer').classList.add('hidden');
    document.getElementById('photo-viewer-img').src = '';
    document.body.style.overflow = '';
}

// ===== Dialog =====
function showDialog(title, message, onConfirm) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    const confirmBtn = document.getElementById('dialog-confirm-btn');
    confirmBtn.onclick = () => { closeDialog(); onConfirm(); };
    document.getElementById('confirm-dialog').classList.remove('hidden');
}
function closeDialog() {
    document.getElementById('confirm-dialog').classList.add('hidden');
}

// ===== Toast =====
function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hidden'); }, 2500);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr).trim();
    if (str.length === 4 && !isNaN(parseInt(str))) {
        return str + ' г.';
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calculateAge(birthDate) {
    if (!birthDate) return 0;
    const str = String(birthDate).trim();
    const birthYear = parseInt(str);
    if (!isNaN(birthYear) && str.length === 4) {
        return new Date().getFullYear() - birthYear;
    }
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU').format(amount) + ' сум';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

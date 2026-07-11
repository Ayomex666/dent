// ===== IndexedDB Database Layer =====
const DB_NAME = 'DentaCareDB';
const DB_VERSION = 1;
let db = null;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const database = e.target.result;

            if (!database.objectStoreNames.contains('patients')) {
                const patientsStore = database.createObjectStore('patients', { keyPath: 'id' });
                patientsStore.createIndex('status', 'status', { unique: false });
                patientsStore.createIndex('lastName', 'lastName', { unique: false });
                patientsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            if (!database.objectStoreNames.contains('visits')) {
                const visitsStore = database.createObjectStore('visits', { keyPath: 'id' });
                visitsStore.createIndex('patientId', 'patientId', { unique: false });
                visitsStore.createIndex('date', 'date', { unique: false });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => {
            reject('Database error: ' + e.target.errorCode);
        };
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ===== Patient CRUD =====
function addPatient(patient) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('patients', 'readwrite');
        const store = tx.objectStore('patients');
        patient.id = generateId();
        patient.createdAt = new Date().toISOString();
        store.add(patient);
        tx.oncomplete = () => resolve(patient);
        tx.onerror = (e) => reject(e);
    });
}

function updatePatient(patient) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('patients', 'readwrite');
        const store = tx.objectStore('patients');
        store.put(patient);
        tx.oncomplete = () => resolve(patient);
        tx.onerror = (e) => reject(e);
    });
}

function deletePatient(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['patients', 'visits'], 'readwrite');
        tx.objectStore('patients').delete(id);
        // Also delete all visits for this patient
        const visitsStore = tx.objectStore('visits');
        const index = visitsStore.index('patientId');
        const req = index.openCursor(IDBKeyRange.only(id));
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

function getPatient(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('patients', 'readonly');
        const store = tx.objectStore('patients');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    });
}

function getAllPatients() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('patients', 'readonly');
        const store = tx.objectStore('patients');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e);
    });
}

// ===== Visit CRUD =====
function addVisit(visit) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('visits', 'readwrite');
        const store = tx.objectStore('visits');
        visit.id = generateId();
        store.add(visit);
        tx.oncomplete = () => resolve(visit);
        tx.onerror = (e) => reject(e);
    });
}

function updateVisit(visit) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('visits', 'readwrite');
        const store = tx.objectStore('visits');
        store.put(visit);
        tx.oncomplete = () => resolve(visit);
        tx.onerror = (e) => reject(e);
    });
}

function deleteVisit(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('visits', 'readwrite');
        const store = tx.objectStore('visits');
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

function getVisitsByPatient(patientId) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('visits', 'readonly');
        const store = tx.objectStore('visits');
        const index = store.index('patientId');
        const req = index.getAll(IDBKeyRange.only(patientId));
        req.onsuccess = () => {
            const visits = req.result || [];
            visits.sort((a, b) => new Date(b.date) - new Date(a.date));
            resolve(visits);
        };
        req.onerror = (e) => reject(e);
    });
}

function getAllVisits() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('visits', 'readonly');
        const store = tx.objectStore('visits');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e);
    });
}

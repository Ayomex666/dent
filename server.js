const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const compression = require('compression');
require('dotenv').config();

// ─── Constants ────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ayomshukurov2009@gmail.com';
const ADMIN_PASS  = process.env.ADMIN_PASS || '20090829';
const JWT_SECRET  = process.env.JWT_SECRET || 'dental_crm_secret_2024_$';

// ─── Database Setup (MongoDB) ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dental-clinic';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Подключено к MongoDB');
    initAdmin();
  })
  .catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    console.error('Если запускаешь на Render, убедись, что добавил переменную MONGODB_URI в Environment Variables!');
  });

// ─── Models ───────────────────────────────────────────────────────────────────
const appointmentSchema = new mongoose.Schema({
  slotKey: { type: String, unique: true, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  client_name: { type: String, required: true },
  client_phone: { type: String, required: true },
  procedure: { type: String, required: true },
  final_price: { type: Number, default: null },
  price_set_at: { type: String, default: null },
  created_at: { type: String, required: true }
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);
const User = mongoose.model('User', userSchema);

async function initAdmin() {
  try {
    const user = await User.findOne({ email: ADMIN_EMAIL });
    if (!user) {
      const hash = bcrypt.hashSync(ADMIN_PASS, 10);
      await User.create({ email: ADMIN_EMAIL, password_hash: hash });
      console.log('✅ Admin user created in MongoDB');
    }
  } catch (err) {
    console.error('Admin init error:', err);
  }
}

// ─── Apps Setup ──────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');

// Улучшение производительности: сжимать все ответы
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({
  origin: function(origin, cb) {
    cb(null, true);
  },
  credentials: true
}));

app.use(express.json({ limit: '50kb' }));

// ─── JWT Middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Helper: date range for stats ─────────────────────────────────────────────
function toLocalISOString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateStrings() {
  const now = new Date();
  const yearStart  = `${now.getFullYear()}-01-01`;
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${now.getFullYear()}-${m}-01`;
  
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() + diff);
  
  const weekStart = toLocalISOString(weekStartDate);
  const today = toLocalISOString(now);
  return { yearStart, monthStart, weekStart, today };
}

// ══════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/slots
app.get('/api/slots', async (req, res) => {
  try {
    const startDate = String(req.query.startDate || '');
    const endDate = String(req.query.endDate || '9999-12-31');
    const docs = await Appointment.find(
      { date: { $gte: startDate, $lte: endDate } },
      'date time -_id'
    );
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/book
app.post('/api/book', async (req, res) => {
  try {
    const date = String(req.body.date || '');
    const time = String(req.body.time || '');
    const client_name = String(req.body.client_name || '');
    const client_phone = String(req.body.client_phone || '');
    const procedure = String(req.body.procedure || '');

    if (!date || !time || !client_name || !client_phone || !procedure)
      return res.status(400).json({ error: 'Все поля обязательны' });

    if (!/^\+992\d{9}$/.test(client_phone))
      return res.status(400).json({ error: 'Номер телефона должен быть в формате +992XXXXXXXXX (9 цифр)' });

    const slotKey = `${date}_${time}`;

    const existing = await Appointment.findOne({ slotKey });
    if (existing) return res.status(409).json({ error: 'Это время уже занято' });

    const newDoc = await Appointment.create({
      slotKey, date, time, client_name, client_phone, procedure,
      final_price: null, price_set_at: null,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id: newDoc._id });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Это время уже занято' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
  try {
    const email = String(req.body.email || '');
    const password = String(req.body.password || '');
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите почту и пароль' });
    }

    const user = await User.findOne({ email });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверная почта или пароль' });
    }
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/admin/stats
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const { yearStart, monthStart, weekStart, today } = getDateStrings();
    const all = await Appointment.find({});

    const yearCount  = all.filter(a => a.date >= yearStart).length;
    const monthCount = all.filter(a => a.date >= monthStart).length;
    const weekCount  = all.filter(a => a.date >= weekStart).length;
    const todayCount = all.filter(a => a.date === today).length;
    const totalCount = all.length;
    const priceSetCount = all.filter(a => a.final_price !== null).length;

    res.json({ yearCount, monthCount, weekCount, todayCount, totalCount, priceSetCount });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/admin/appointments
app.get('/api/admin/appointments', authMiddleware, async (req, res) => {
  try {
    const docs = await Appointment.find({}).sort({ date: -1, time: 1 });
    res.json(docs.map(d => ({ ...d.toObject(), id: d._id })));
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// PATCH /api/admin/appointments/:id/price
app.patch('/api/admin/appointments/:id/price', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { final_price } = req.body;

    if (typeof final_price !== 'number' || final_price < 0)
      return res.status(400).json({ error: 'Некорректная цена' });

    const doc = await Appointment.findById(id);
    if (!doc) return res.status(404).json({ error: 'Запись не найдена' });
    if (doc.final_price !== null)
      return res.status(403).json({ error: 'Цена уже установлена и не может быть изменена' });

    doc.final_price = final_price;
    doc.price_set_at = new Date().toISOString();
    await doc.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE /api/admin/appointments/:id
app.delete('/api/admin/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const result = await Appointment.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  STATIC FILES (FRONTEND)
// ══════════════════════════════════════════════════════════════════════════════

// Serve Admin UI on /admin (cache static files, but not HTML)
const staticOptions = {
  maxAge: '7d', // Кэшировать статику на 7 дней
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
};

app.use('/admin', express.static(path.join(__dirname, 'admin'), staticOptions));

// Serve Main UI on /
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Catch-all for /admin/* (SPA routing if needed)
app.get('/admin/*', (req, res) =>
  res.sendFile(path.join(__dirname, 'admin', 'index.html'))
);

// Catch-all for main site (SPA routing if needed)
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Global Error: ', err.stack);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT,  () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const adminDir = path.join(__dirname, 'admin');

// Очищаем папку dist если она существует
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}

// Создаем папку dist/admin
fs.mkdirSync(path.join(distDir, 'admin'), { recursive: true });

// Копируем содержимое public в корень dist
try {
    fs.cpSync(publicDir, distDir, { recursive: true });
    console.log('✅ Папка public скопирована в dist');
} catch (err) {
    console.error('Ошибка при копировании public:', err);
}

// Копируем содержимое admin в dist/admin
try {
    fs.cpSync(adminDir, path.join(distDir, 'admin'), { recursive: true });
    console.log('✅ Папка admin скопирована в dist/admin');
} catch (err) {
    console.error('Ошибка при копировании admin:', err);
}

console.log('🚀 Сборка для Netlify успешно завершена!');

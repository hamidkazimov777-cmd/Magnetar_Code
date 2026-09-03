#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

if (command === 'web') {
  console.log('\n🚀 Инициализация Magnetar Web UI...\n');
  
  const nextCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const projectRoot = path.join(__dirname, '..');
  
  // Запускаем Next.js (сейчас dev, для продакшена будет start)
  const child = spawn(nextCmd, ['run', 'dev'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  let browserOpened = false;

  child.stdout.on('data', async (data) => {
    const output = data.toString();
    process.stdout.write(output);
    
    // Ищем сигнал от Next.js, что сервер готов
    if (!browserOpened && (output.includes('Ready') || output.includes('Local:') || output.includes('ready in'))) {
      browserOpened = true;
      console.log('\n✅ Сервер готов! Открываем браузер...\n');
      try {
        const open = (await import('open')).default;
        open('http://localhost:3000');
      } catch (err) {
        console.error('Не удалось автоматически открыть браузер:', err);
      }
    }
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  child.on('close', (code) => {
    console.log(`\n🔴 Сервер остановлен (код ${code})`);
    process.exit(code);
  });
  
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit();
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit();
  });

} else {
  console.log(`
=========================================
      MAGNETAR AI WORKSPACE CLI
=========================================

Доступные команды:

  magnetar web    - Запуск локального Web UI сервера и открытие в браузере

Использование: 
  $ magnetar web
=========================================
  `);
}

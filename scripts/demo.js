'use strict';

/**
 * Modo demostración: arranca el servidor y abre automáticamente las tres
 * ventanas en el navegador predeterminado del computador:
 *
 *   1. /pantalla  (la que se proyecta)
 *   2. /admin     (panel del supervisor)
 *   3. /          (vista del participante, para simular un celular)
 *
 *   npm run demo
 */

const { spawn } = require('child_process');
const path = require('path');

function openInBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).on('error', () => {
        console.log(`  (no se pudo abrir el navegador; abre manualmente: ${url})`);
      });
    }
  } catch (err) {
    console.log(`  (no se pudo abrir el navegador; abre manualmente: ${url})`);
  }
}

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  cwd: path.join(__dirname, '..'),
  stdio: ['inherit', 'pipe', 'inherit'],
});

let opened = false;
server.stdout.on('data', (chunk) => {
  const text = String(chunk);
  process.stdout.write(text);
  if (!opened) {
    const match = text.match(/Participantes:\s+(http:\/\/localhost:\d+\/)/);
    if (match) {
      opened = true;
      const base = match[1];
      console.log('\nAbriendo las tres ventanas en tu navegador…');
      console.log('  1. Pantalla (proyectar):  ' + base + 'pantalla');
      console.log('  2. Supervisor (tú):       ' + base + 'admin');
      console.log('  3. Participante (simula un celular): ' + base);
      console.log('\nEn las dos primeras entra con el código de acceso; en la tercera con un nombre.');
      console.log('Para detener el servidor: Ctrl + C\n');
      openInBrowser(base + 'pantalla');
      setTimeout(() => openInBrowser(base + 'admin'), 800);
      setTimeout(() => openInBrowser(base), 1600);
    }
  }
});

server.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => server.kill('SIGINT'));

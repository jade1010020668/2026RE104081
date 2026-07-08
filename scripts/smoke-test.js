'use strict';

/**
 * Prueba de humo de punta a punta: levanta el servidor en un puerto de
 * prueba, conecta un supervisor y tres participantes, juega una pregunta
 * completa y verifica puntuación, caritas, ranking y sorteo.
 *
 *   npm run smoke
 */

const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://127.0.0.1:${PORT}`;
const ADMIN_CODE = 'smoke-code';

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Espera el primer evento cuyo contenido cumpla el predicado. */
function waitState(socket, event, predicate) {
  return new Promise((resolve) => {
    const handler = (s) => {
      if (predicate(s)) {
        socket.off(event, handler);
        resolve(s);
      }
    };
    socket.on(event, handler);
  });
}

function connect() {
  const s = io(URL, { transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

async function waitForServer(proc) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor no inició a tiempo')), 15000);
    proc.stdout.on('data', (chunk) => {
      if (String(chunk).includes('servidor iniciado')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_CODE,
      // sesión limpia y sin autocierre para controlar el flujo desde la prueba
      AUTO_CLOSE: 'false',
    },
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  try {
    await waitForServer(server);
    console.log('Servidor de prueba iniciado.');

    // --- supervisor ---
    const admin = await connect();
    const badLogin = await emit(admin, 'admin:login', { code: 'incorrecto' });
    check('rechaza código de supervisor incorrecto', badLogin.ok === false);
    const goodLogin = await emit(admin, 'admin:login', { code: ADMIN_CODE });
    check('acepta código de supervisor correcto', goodLogin.ok === true);

    // sesión limpia por si quedó estado persistido de una corrida anterior
    await emit(admin, 'admin:reset_session', {});

    // --- participantes ---
    const ana = await connect();
    const luis = await connect();
    const rosa = await connect();
    const joinAna = await emit(ana, 'participant:join', { name: 'Ana' });
    const joinLuis = await emit(luis, 'participant:join', { name: 'Luis' });
    const joinRosa = await emit(rosa, 'participant:join', { name: 'Rosa' });
    check('los tres participantes ingresan', joinAna.ok && joinLuis.ok && joinRosa.ok);

    const joinDup = await emit(await connect(), 'participant:join', { name: 'ana' });
    check('nombre duplicado recibe sufijo', joinDup.ok && joinDup.name !== 'Ana');

    const early = await emit(ana, 'participant:answer', { choice: 0 });
    check('no se puede responder sin pregunta activa', early.ok === false);

    // --- activar la primera pregunta ---
    const activePromise = waitState(admin, 'admin:state', (s) => s.phase === 'question');
    admin.emit('admin:start_question', {}, () => {});
    const stateBefore = await activePromise;
    check('la pregunta queda activa', stateBefore.phase === 'question');
    const q = stateBefore.questions.find((qq) => qq.status === 'activa');
    check('hay exactamente una pregunta activa', !!q);

    // --- respuestas: Ana correcta, Luis incorrecta, Rosa no responde ---
    const okAns = await emit(ana, 'participant:answer', { choice: q.correctIndex });
    check('respuesta correcta puntúa entre 500 y 1000',
      okAns.ok && okAns.answer.score >= 500 && okAns.answer.score <= 1000);
    check('respuesta correcta y rápida da carita feliz', okAns.answer.face === 'feliz');

    const dupAns = await emit(ana, 'participant:answer', { choice: q.correctIndex });
    check('no se puede responder dos veces', dupAns.ok === false);

    const wrongChoice = (q.correctIndex + 1) % q.options.length;
    const badAns = await emit(luis, 'participant:answer', { choice: wrongChoice });
    check('respuesta incorrecta da 0 puntos y carita triste',
      badAns.ok && badAns.answer.score === 0 && badAns.answer.face === 'triste');

    // --- cerrar la pregunta ---
    const closedPromise = waitState(admin, 'admin:state', (s) => s.phase === 'closed');
    admin.emit('admin:close_question', {}, () => {});
    const closed = await closedPromise;
    check('la pregunta queda cerrada', closed.phase === 'closed');

    const ranking = closed.accumulated.ranking;
    check('el ranking tiene 4 registrados', ranking.length === 4);
    check('Ana queda de primera', ranking[0].name === 'Ana' && ranking[0].position === 1);
    const rosaRow = ranking.find((r) => r.name === 'Rosa');
    check('quien no respondió queda con 0 y carita llorando',
      rosaRow.total === 0 && rosaRow.faces[0] === 'llorando');

    const lastQ = closed.lastQuestion;
    check('estadísticas de la pregunta: 2 respondieron, 1 acertó',
      lastQ.stats.answered === 2 && lastQ.stats.correct === 1);

    const rosaSnapshot = await new Promise((resolve) => {
      rosa.once('participant:state', resolve);
      rosa.emit('participant:join', { token: joinRosa.token }, (res) => {
        check('un participante puede reconectarse con su token', res.ok === true);
      });
    });
    check('el participante recibe su posición tras el cierre',
      rosaSnapshot.me && rosaSnapshot.me.standing && rosaSnapshot.me.standing.position >= 1);

    // --- sorteo y pantalla ---
    const sorteoPromise = waitState(admin, 'admin:state', (s) => s.screen === 'sorteo');
    admin.emit('admin:sorteo', {}, () => {});
    const sorteoState = await sorteoPromise;
    check('el sorteo elige a alguien y cambia la pantalla',
      !!sorteoState.sorteo && sorteoState.screen === 'sorteo');

    const screen = await connect();
    const screenLogin = await emit(screen, 'screen:login', { code: ADMIN_CODE });
    check('la pantalla ingresa con el código', screenLogin.ok === true);
    const accumulatedPromise = waitState(screen, 'screen:state', (s) => s.screen === 'accumulated');
    admin.emit('admin:set_screen', { view: 'accumulated' }, () => {});
    const screenState = await accumulatedPromise;
    check('la pantalla recibe la tabla acumulada',
      screenState.screen === 'accumulated' && screenState.accumulated.ranking.length === 4);

    // --- QR ---
    const res = await fetch(`${URL}/api/qr.svg`);
    const svg = await res.text();
    check('el endpoint del QR responde un SVG', res.ok && svg.includes('<svg'));

    // limpiar la sesión de prueba para no dejar rastros locales
    await emit(admin, 'admin:reset_session', {});
  } finally {
    server.kill();
  }

  console.log(failures === 0 ? '\nPrueba de humo: TODO OK ✅' : `\nPrueba de humo: ${failures} fallas ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error en la prueba de humo:', err);
  process.exit(1);
});

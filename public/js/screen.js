'use strict';

/* Pantalla proyectada: portada con QR, pregunta en vivo, resultados por
   pregunta, tabla general acumulada y sorteo. La vista que se muestra la
   decide el supervisor desde /admin (campo `screen` del estado). */

const socket = io();

const loginView = document.getElementById('view-login');
const mainView = document.getElementById('view-main');

const sections = {
  lobby: document.getElementById('s-lobby'),
  question: document.getElementById('s-question'),
  question_ranking: document.getElementById('s-qranking'),
  accumulated: document.getElementById('s-accumulated'),
  sorteo: document.getElementById('s-sorteo'),
};

let state = null;
let lastSorteoKey = null;
let sorteoSpinTimer = null;

const countdown = makeCountdown(
  document.getElementById('sq-bar'),
  document.getElementById('sq-clock')
);

fetch('/api/join-url')
  .then((r) => r.json())
  .then(({ url }) => {
    document.getElementById('qr-url').textContent = url;
  })
  .catch(() => {});

function login(code) {
  socket.emit('screen:login', { code }, (res) => {
    if (!res.ok) {
      toast(res.error || 'Código incorrecto.');
      localStorage.removeItem('vrm_screen_code');
      loginView.hidden = false;
      mainView.hidden = true;
      return;
    }
    localStorage.setItem('vrm_screen_code', code);
    loginView.hidden = true;
    mainView.hidden = false;
  });
}

document.getElementById('login-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  login(document.getElementById('login-code').value);
});

socket.on('connect', () => {
  const saved = localStorage.getItem('vrm_screen_code');
  if (saved) login(saved);
  else loginView.hidden = false;
});

function showSection(name) {
  for (const [key, node] of Object.entries(sections)) node.hidden = key !== name;
}

function renderLobby() {
  document.getElementById('lobby-count').textContent = String(state.counts.connected);
  const chips = clear(document.getElementById('lobby-chips'));
  for (const name of state.lobbyNames.slice(-80)) chips.appendChild(el('span', 'chip', name));
}

function renderQuestion() {
  const q = state.question;
  if (!q) return;
  document.getElementById('sq-number').textContent = `Pregunta ${q.playedBefore + 1}`;
  document.getElementById('sq-text').textContent = q.text;
  document.getElementById('sq-answered').textContent =
    `${state.counts.answeredCurrent} / ${state.counts.connected} han respondido`;
  const box = clear(document.getElementById('sq-options'));
  q.options.forEach((optText, i) => {
    const div = el('div', 'opt');
    div.dataset.i = String(i);
    div.appendChild(el('span', 'letter', LETTERS[i]));
    div.appendChild(el('span', null, optText));
    box.appendChild(div);
  });
  countdown.start(q.deadline, q.timeLimitSec);
}

function renderQuestionRanking() {
  const lq = state.lastQuestion;
  if (!lq) return;
  document.getElementById('qr-title').textContent =
    `Resultados · Pregunta ${state.accumulated.playedCount}`;
  document.getElementById('qr-correct').textContent =
    `Respuesta correcta: ${LETTERS[lq.question.correctIndex]}. ${lq.question.options[lq.question.correctIndex]}`;

  // distribución de respuestas por opción (identidad de cada opción)
  const dist = clear(document.getElementById('qr-dist'));
  const maxCount = Math.max(...lq.stats.perOption, 1);
  lq.question.options.forEach((optText, i) => {
    const row = el('div', 'drow');
    row.dataset.i = String(i);
    if (i === lq.question.correctIndex) row.classList.add('correct');
    row.title = optText;
    row.appendChild(el('span', 'dlabel', LETTERS[i]));
    const track = el('div', 'dtrack');
    const fill = el('div', 'dfill');
    fill.style.width = (lq.stats.perOption[i] / maxCount) * 100 + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'dcount num', String(lq.stats.perOption[i])));
    dist.appendChild(row);
  });

  // resumen de caritas
  const faces = clear(document.getElementById('qr-faces'));
  for (const key of ['feliz', 'enojada', 'triste', 'llorando']) {
    const fs = el('div', 'fs');
    fs.appendChild(el('span', 'e', FACES[key].emoji));
    const txt = el('div');
    txt.appendChild(el('div', 'n num', String(lq.stats.faces[key] || 0)));
    txt.appendChild(el('div', 'l', FACES[key].label.split('·')[1].trim()));
    fs.appendChild(txt);
    faces.appendChild(fs);
  }

  // top 10 de la pregunta
  const top = clear(document.getElementById('qr-top'));
  const entries = lq.entries.slice(0, 10);
  const max = Math.max(...entries.map((e) => e.score), 1);
  for (const e of entries) {
    const extras = el('span', 'face-sm', faceEmoji(e.face));
    top.appendChild(
      rankRow({ position: e.position, name: e.name, score: e.score, maxScore: max, extras })
    );
  }
}

function renderAccumulated() {
  const acc = state.accumulated;
  document.getElementById('acc-sub').textContent =
    `Acumulado tras ${acc.playedCount} de ${acc.totalQuestions} preguntas`;
  const list = clear(document.getElementById('acc-list'));
  const max = Math.max(...acc.ranking.map((r) => r.total), 1);
  for (const r of acc.ranking) {
    const extras = el('span', 'face-sm', r.faces.map((f) => (f ? faceEmoji(f) : '·')).join(' '));
    list.appendChild(
      rankRow({
        position: r.position,
        name: r.name,
        score: r.total,
        maxScore: max,
        delta: r.delta,
        extras,
      })
    );
  }
}

function renderSorteo() {
  const s = state.sorteo;
  if (!s) return;
  const nameEl = document.getElementById('sorteo-name');
  const detail = document.getElementById('sorteo-detail');
  const key = s.token + ':' + (s.question ? s.question.number : 0);

  const reveal = () => {
    nameEl.classList.remove('spinning');
    nameEl.textContent = s.name;
    clear(detail);
    detail.hidden = false;

    const line = el('p', 's-sub');
    line.appendChild(
      document.createTextNode(
        s.position
          ? `Puesto ${s.position} de ${s.totalParticipants} · ${s.totalScore} puntos acumulados`
          : `${s.totalScore} puntos acumulados`
      )
    );
    detail.appendChild(line);

    if (s.question) {
      detail.appendChild(el('h3', null, `Pregunta ${s.question.number}: ${s.question.text}`));
      const a = s.answer;
      if (a && a.choice != null) {
        const p = el('p');
        const dot = el('span', 'optdot');
        dot.dataset.i = String(a.choice);
        p.appendChild(dot);
        p.appendChild(
          document.createTextNode(
            `Respondió: ${LETTERS[a.choice]}. ${s.question.options[a.choice]} `
          )
        );
        p.appendChild(el('span', 'face-sm', ` ${faceEmoji(a.face)}`));
        detail.appendChild(p);
        detail.appendChild(
          el('p', a.correct ? 'delta up' : 'delta down',
            a.correct ? `¡Correcta! +${a.score} puntos` : 'Incorrecta · 0 puntos')
        );
      } else {
        detail.appendChild(el('p', 'secondary', `No alcanzó a responder ${faceEmoji('llorando')} · 0 puntos`));
      }
      detail.appendChild(
        el('p', 'secondary',
          `Respuesta correcta: ${LETTERS[s.question.correctIndex]}. ${s.question.options[s.question.correctIndex]}`)
      );
    }
  };

  if (key !== lastSorteoKey) {
    lastSorteoKey = key;
    detail.hidden = true;
    nameEl.classList.add('spinning');
    clearInterval(sorteoSpinTimer);
    const pool = s.candidates && s.candidates.length ? s.candidates : [s.name];
    let ticks = 0;
    sorteoSpinTimer = setInterval(() => {
      nameEl.textContent = pool[ticks % pool.length];
      ticks++;
      if (ticks > 24) {
        clearInterval(sorteoSpinTimer);
        reveal();
      }
    }, 90);
  } else if (!nameEl.classList.contains('spinning')) {
    reveal();
  }
}

function render() {
  if (!state) return;
  document.getElementById('hdr-connected').textContent =
    `${state.counts.connected} conectados`;

  if (state.screen !== 'question') countdown.stop();
  if (state.screen !== 'sorteo') {
    clearInterval(sorteoSpinTimer);
    lastSorteoKey = state.sorteo ? lastSorteoKey : null;
  }

  showSection(state.screen);
  if (state.screen === 'lobby') renderLobby();
  if (state.screen === 'question') renderQuestion();
  if (state.screen === 'question_ranking') renderQuestionRanking();
  if (state.screen === 'accumulated') renderAccumulated();
  if (state.screen === 'sorteo') renderSorteo();
}

socket.on('screen:state', (snapshot) => {
  state = snapshot;
  render();
});

socket.on('session:reset', () => {
  lastSorteoKey = null;
});

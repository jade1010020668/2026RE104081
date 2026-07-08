'use strict';

/**
 * Lógica del quiz en tiempo real para la capacitación VRM/VA.
 *
 * Caritas de desempeño por pregunta:
 *   feliz    😄  respuesta correcta y rápida (primera mitad del tiempo)
 *   enojada  😠  respuesta correcta pero lenta (segunda mitad del tiempo)
 *   triste   😢  respuesta incorrecta
 *   llorando 😭  no respondió (tiempo agotado) → puntuación 0
 *
 * Puntuación: correcta = 500 + 500 · (tiempo restante / tiempo total),
 * es decir entre 500 y 1000 puntos según rapidez. Incorrecta o sin
 * respuesta = 0.
 */

const crypto = require('crypto');

const FACE_EMOJI = {
  feliz: '😄',
  enojada: '😠',
  triste: '😢',
  llorando: '😭',
};

const DEFAULT_OPTS = {
  defaultTimeLimitSec: 180,
  showResultOnAnswer: true,
  autoCloseWhenAllAnswered: true,
};

function newId(bytes = 6) {
  return crypto.randomBytes(bytes).toString('hex');
}

function validateQuestion(raw, defaultTimeLimitSec) {
  if (!raw || typeof raw !== 'object') throw new Error('Pregunta inválida.');
  const text = String(raw.text || '').trim();
  if (!text) throw new Error('El enunciado de la pregunta es obligatorio.');
  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o == null ? '' : o).trim())
    : [];
  if (options.length < 2 || options.length > 6) {
    throw new Error('Cada pregunta debe tener entre 2 y 6 opciones.');
  }
  if (options.some((o) => !o)) throw new Error('Ninguna opción puede estar vacía.');
  const correctIndex = Number(raw.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    throw new Error('La respuesta correcta señalada no es válida.');
  }
  let timeLimitSec = Number(raw.timeLimitSec) || defaultTimeLimitSec;
  timeLimitSec = Math.min(600, Math.max(10, Math.round(timeLimitSec)));
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    text,
    options,
    correctIndex,
    timeLimitSec,
  };
}

class Game {
  constructor(questions = [], opts = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.questions = questions.map((q) => validateQuestion(q, this.opts.defaultTimeLimitSec));
    this.resetSession();
  }

  resetSession() {
    this.phase = 'lobby'; // 'lobby' | 'question' | 'closed'
    this.screen = 'lobby'; // 'lobby' | 'question' | 'question_ranking' | 'accumulated' | 'sorteo'
    this.currentId = null;
    this.lastPlayedId = null;
    this.startedAt = null;
    this.deadline = null;
    this.playedIds = [];
    this.participants = new Map(); // token -> participante
    this.lastDeltas = new Map(); // token -> cambio de posición tras la última pregunta
    this.sorteo = null;
  }

  // ---------- participantes ----------

  uniqueName(base) {
    const taken = new Set(
      [...this.participants.values()].map((p) => p.name.toLowerCase())
    );
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  join(name, token) {
    if (token && this.participants.has(token)) {
      const p = this.participants.get(token);
      p.connected = true;
      return p;
    }
    const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!clean) throw new Error('Escribe tu nombre para ingresar.');
    const p = {
      token: newId(12),
      name: this.uniqueName(clean),
      joinedAt: Date.now(),
      connected: true,
      answers: {}, // questionId -> {choice, elapsedMs, correct, score, face}
      totalScore: 0,
      timeSumMs: 0, // desempate: menor tiempo acumulado gana
    };
    this.participants.set(p.token, p);
    return p;
  }

  setConnected(token, connected) {
    const p = this.participants.get(token);
    if (p) p.connected = connected;
  }

  removeParticipant(token) {
    return this.participants.delete(token);
  }

  // ---------- preguntas (CRUD del administrador) ----------

  findQuestion(id) {
    return this.questions.find((q) => q.id === id) || null;
  }

  questionNumber(id) {
    const idx = this.questions.findIndex((q) => q.id === id);
    return idx >= 0 ? idx + 1 : null;
  }

  isLocked(id) {
    return this.playedIds.includes(id) || this.currentId === id;
  }

  addQuestion(raw) {
    const q = validateQuestion({ ...raw, id: undefined }, this.opts.defaultTimeLimitSec);
    this.questions.push(q);
    return q;
  }

  updateQuestion(id, raw) {
    const idx = this.questions.findIndex((q) => q.id === id);
    if (idx < 0) throw new Error('La pregunta no existe.');
    if (this.isLocked(id)) throw new Error('No se puede editar una pregunta ya jugada o activa.');
    this.questions[idx] = validateQuestion({ ...raw, id }, this.opts.defaultTimeLimitSec);
    return this.questions[idx];
  }

  deleteQuestion(id) {
    const idx = this.questions.findIndex((q) => q.id === id);
    if (idx < 0) throw new Error('La pregunta no existe.');
    if (this.isLocked(id)) throw new Error('No se puede eliminar una pregunta ya jugada o activa.');
    this.questions.splice(idx, 1);
  }

  // ---------- flujo del juego ----------

  currentQuestion() {
    return this.currentId ? this.findQuestion(this.currentId) : null;
  }

  nextPendingId() {
    const q = this.questions.find((qq) => !this.playedIds.includes(qq.id));
    return q ? q.id : null;
  }

  startQuestion(id, now = Date.now()) {
    if (this.phase === 'question') {
      throw new Error('Ya hay una pregunta activa. Ciérrala antes de activar otra.');
    }
    const q = this.findQuestion(id);
    if (!q) throw new Error('La pregunta no existe.');
    if (this.playedIds.includes(id)) throw new Error('Esa pregunta ya fue jugada.');
    this.phase = 'question';
    this.screen = 'question';
    this.currentId = id;
    this.startedAt = now;
    this.deadline = now + q.timeLimitSec * 1000;
    this.sorteo = null;
    return q;
  }

  submitAnswer(token, choice, now = Date.now()) {
    const p = this.participants.get(token);
    if (!p) throw new Error('No estás registrado. Vuelve a ingresar con tu nombre.');
    if (this.phase !== 'question') throw new Error('No hay una pregunta activa en este momento.');
    if (now > this.deadline + 500) throw new Error('El tiempo para esta pregunta ya terminó.');
    const q = this.currentQuestion();
    if (p.answers[q.id]) throw new Error('Ya respondiste esta pregunta.');
    const idx = Number(choice);
    if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) {
      throw new Error('Opción no válida.');
    }
    const limitMs = q.timeLimitSec * 1000;
    const elapsedMs = Math.max(0, Math.min(now - this.startedAt, limitMs));
    const correct = idx === q.correctIndex;
    const score = correct ? Math.round(500 + 500 * ((limitMs - elapsedMs) / limitMs)) : 0;
    const face = !correct ? 'triste' : elapsedMs <= limitMs / 2 ? 'feliz' : 'enojada';
    const answer = { choice: idx, elapsedMs, correct, score, face };
    p.answers[q.id] = answer;
    return answer;
  }

  answeredCurrentCount() {
    if (!this.currentId) return 0;
    let n = 0;
    for (const p of this.participants.values()) if (p.answers[this.currentId]) n++;
    return n;
  }

  allConnectedAnswered() {
    if (!this.currentId) return false;
    const connected = [...this.participants.values()].filter((p) => p.connected);
    return connected.length > 0 && connected.every((p) => p.answers[this.currentId]);
  }

  /**
   * Cierra la pregunta activa: quien no respondió recibe 0 puntos y carita
   * llorando, se suman los puntajes al acumulado y se calculan los cambios
   * de posición frente al ranking anterior.
   */
  closeQuestion(now = Date.now()) {
    if (this.phase !== 'question') return false;
    const q = this.currentQuestion();
    const limitMs = q.timeLimitSec * 1000;

    const prevPositions =
      this.playedIds.length > 0
        ? new Map(this.accumulatedRanking().map((r) => [r.token, r.position]))
        : null;

    for (const p of this.participants.values()) {
      if (!p.answers[q.id]) {
        p.answers[q.id] = { choice: null, elapsedMs: null, correct: false, score: 0, face: 'llorando' };
      }
      const a = p.answers[q.id];
      p.totalScore += a.score;
      p.timeSumMs += a.elapsedMs == null ? limitMs : a.elapsedMs;
    }

    this.playedIds.push(q.id);
    this.lastPlayedId = q.id;
    this.currentId = null;
    this.startedAt = null;
    this.deadline = null;
    this.phase = 'closed';
    this.screen = 'question_ranking';

    this.lastDeltas = new Map();
    for (const r of this.accumulatedRanking()) {
      const prev = prevPositions ? prevPositions.get(r.token) : undefined;
      this.lastDeltas.set(r.token, prev == null ? null : prev - r.position);
    }
    return true;
  }

  setScreen(view) {
    const allowed = ['lobby', 'question', 'question_ranking', 'accumulated', 'sorteo'];
    if (!allowed.includes(view)) throw new Error('Vista de pantalla no válida.');
    if (view === 'question' && this.phase !== 'question') {
      throw new Error('No hay una pregunta activa para mostrar.');
    }
    if (view === 'question_ranking' && !this.lastPlayedId) {
      throw new Error('Aún no se ha jugado ninguna pregunta.');
    }
    if (view === 'sorteo' && !this.sorteo) {
      throw new Error('Primero realiza un sorteo.');
    }
    this.screen = view;
  }

  runSorteo(rng = Math.random) {
    const pool = [...this.participants.values()];
    if (pool.length === 0) throw new Error('Aún no hay participantes registrados.');
    const winner = pool[Math.floor(rng() * pool.length)];
    const qid = this.lastPlayedId;
    const q = qid ? this.findQuestion(qid) : null;
    const ranking = this.accumulatedRanking();
    const mine = ranking.find((r) => r.token === winner.token) || null;
    this.sorteo = {
      token: winner.token,
      name: winner.name,
      totalScore: winner.totalScore,
      position: mine ? mine.position : null,
      totalParticipants: ranking.length,
      question: q
        ? {
            number: this.questionNumber(q.id),
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
          }
        : null,
      answer: q ? winner.answers[q.id] || null : null,
      candidates: pool.map((p) => p.name),
    };
    this.screen = 'sorteo';
    return this.sorteo;
  }

  // ---------- rankings ----------

  accumulatedRanking() {
    const rows = [...this.participants.values()].map((p) => ({
      token: p.token,
      name: p.name,
      connected: p.connected,
      total: p.totalScore,
      timeSumMs: p.timeSumMs,
      faces: this.playedIds.map((qid) => (p.answers[qid] ? p.answers[qid].face : null)),
    }));
    rows.sort(
      (a, b) =>
        b.total - a.total || a.timeSumMs - b.timeSumMs || a.name.localeCompare(b.name, 'es')
    );
    rows.forEach((r, i) => {
      r.position = i + 1;
      const d = this.lastDeltas.get(r.token);
      r.delta = d == null ? null : d;
    });
    return rows;
  }

  questionRanking(qid) {
    const q = this.findQuestion(qid);
    if (!q) return null;
    const entries = [];
    const perOption = q.options.map(() => 0);
    const faces = { feliz: 0, enojada: 0, triste: 0, llorando: 0 };
    for (const p of this.participants.values()) {
      const a = p.answers[qid];
      if (!a) continue;
      entries.push({
        token: p.token,
        name: p.name,
        choice: a.choice,
        correct: a.correct,
        score: a.score,
        face: a.face,
        elapsedMs: a.elapsedMs,
      });
      if (a.choice != null) perOption[a.choice]++;
      faces[a.face]++;
    }
    entries.sort(
      (a, b) =>
        b.score - a.score ||
        (a.elapsedMs == null ? Infinity : a.elapsedMs) -
          (b.elapsedMs == null ? Infinity : b.elapsedMs) ||
        a.name.localeCompare(b.name, 'es')
    );
    entries.forEach((e, i) => (e.position = i + 1));
    return {
      question: {
        id: q.id,
        number: this.questionNumber(q.id),
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
      },
      entries,
      stats: {
        total: entries.length,
        answered: entries.filter((e) => e.choice != null).length,
        correct: entries.filter((e) => e.correct).length,
        faces,
        perOption,
      },
    };
  }

  // ---------- instantáneas para cada rol ----------

  publicQuestionPayload() {
    const q = this.currentQuestion();
    if (!q) return null;
    return {
      id: q.id,
      number: this.questionNumber(q.id),
      total: this.questions.length,
      playedBefore: this.playedIds.length,
      text: q.text,
      options: q.options,
      timeLimitSec: q.timeLimitSec,
      startedAt: this.startedAt,
      deadline: this.deadline,
    };
  }

  counts() {
    let connected = 0;
    for (const p of this.participants.values()) if (p.connected) connected++;
    return {
      participants: this.participants.size,
      connected,
      answeredCurrent: this.answeredCurrentCount(),
    };
  }

  screenSnapshot() {
    return {
      screen: this.screen,
      phase: this.phase,
      counts: this.counts(),
      lobbyNames: [...this.participants.values()].map((p) => p.name),
      question: this.publicQuestionPayload(),
      lastQuestion: this.lastPlayedId ? this.questionRanking(this.lastPlayedId) : null,
      accumulated: {
        playedCount: this.playedIds.length,
        totalQuestions: this.questions.length,
        ranking: this.accumulatedRanking(),
      },
      sorteo: this.sorteo,
    };
  }

  participantSnapshot(token) {
    const p = this.participants.get(token) || null;
    const base = {
      phase: this.phase,
      screen: this.screen,
      counts: this.counts(),
      playedCount: this.playedIds.length,
      totalQuestions: this.questions.length,
      question: this.publicQuestionPayload(),
      me: null,
    };
    if (!p) return base;

    let lastResult = null;
    if (this.phase === 'question' && p.answers[this.currentId]) {
      if (this.opts.showResultOnAnswer) {
        const a = p.answers[this.currentId];
        lastResult = {
          pending: false,
          revealed: false,
          questionNumber: this.questionNumber(this.currentId),
          correct: a.correct,
          score: a.score,
          face: a.face,
          faceEmoji: FACE_EMOJI[a.face],
        };
      } else {
        lastResult = { pending: true };
      }
    } else if (this.phase !== 'question' && this.lastPlayedId && p.answers[this.lastPlayedId]) {
      const q = this.findQuestion(this.lastPlayedId);
      const a = p.answers[this.lastPlayedId];
      lastResult = {
        pending: false,
        revealed: true,
        questionNumber: this.questionNumber(q.id),
        correct: a.correct,
        score: a.score,
        face: a.face,
        faceEmoji: FACE_EMOJI[a.face],
        choice: a.choice,
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex],
      };
    }

    let standing = null;
    if (this.playedIds.length > 0 && this.phase !== 'question') {
      const ranking = this.accumulatedRanking();
      const mine = ranking.find((r) => r.token === token);
      standing = {
        position: mine ? mine.position : null,
        delta: mine ? mine.delta : null,
        total: mine ? mine.total : 0,
        totalParticipants: ranking.length,
        top: ranking.slice(0, 5).map((r) => ({
          position: r.position,
          name: r.name,
          total: r.total,
          delta: r.delta,
        })),
      };
    }

    base.me = {
      name: p.name,
      totalScore: p.totalScore,
      answeredCurrent: !!(this.currentId && p.answers[this.currentId]),
      lastResult,
      standing,
    };
    return base;
  }

  adminSnapshot() {
    const ranking = this.accumulatedRanking();
    const posByToken = new Map(ranking.map((r) => [r.token, r.position]));
    return {
      phase: this.phase,
      screen: this.screen,
      currentId: this.currentId,
      lastPlayedId: this.lastPlayedId,
      deadline: this.deadline,
      counts: this.counts(),
      config: this.opts,
      nextPendingId: this.nextPendingId(),
      questions: this.questions.map((q) => {
        const played = this.playedIds.includes(q.id);
        return {
          id: q.id,
          number: this.questionNumber(q.id),
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          timeLimitSec: q.timeLimitSec,
          status: this.currentId === q.id ? 'activa' : played ? 'jugada' : 'pendiente',
          stats: played ? this.questionRanking(q.id).stats : null,
        };
      }),
      participants: [...this.participants.values()]
        .map((p) => ({
          token: p.token,
          name: p.name,
          connected: p.connected,
          totalScore: p.totalScore,
          answeredCurrent: !!(this.currentId && p.answers[this.currentId]),
          position: posByToken.get(p.token) || null,
        }))
        .sort((a, b) => (a.position || 0) - (b.position || 0)),
      lastQuestion: this.lastPlayedId ? this.questionRanking(this.lastPlayedId) : null,
      accumulated: { playedCount: this.playedIds.length, ranking },
      sorteo: this.sorteo,
    };
  }

  // ---------- persistencia ----------

  toJSON() {
    return {
      opts: this.opts,
      phase: this.phase,
      screen: this.screen,
      currentId: this.currentId,
      lastPlayedId: this.lastPlayedId,
      startedAt: this.startedAt,
      deadline: this.deadline,
      playedIds: this.playedIds,
      questions: this.questions,
      participants: [...this.participants.values()],
      lastDeltas: [...this.lastDeltas.entries()],
      sorteo: this.sorteo,
    };
  }

  static restore(json, opts = {}) {
    const game = new Game(json.questions || [], { ...(json.opts || {}), ...opts });
    game.phase = json.phase || 'lobby';
    game.screen = json.screen || 'lobby';
    game.currentId = json.currentId || null;
    game.lastPlayedId = json.lastPlayedId || null;
    game.startedAt = json.startedAt || null;
    game.deadline = json.deadline || null;
    game.playedIds = Array.isArray(json.playedIds) ? json.playedIds : [];
    for (const p of json.participants || []) {
      game.participants.set(p.token, { ...p, connected: false });
    }
    game.lastDeltas = new Map(json.lastDeltas || []);
    game.sorteo = json.sorteo || null;
    return game;
  }
}

module.exports = { Game, FACE_EMOJI, validateQuestion };

(() => {
  'use strict';

  const FORMAT_VERSION = 1;

  function finiteInteger(value) {
    return Number.isSafeInteger(value) && Number.isFinite(value);
  }

  function createSessionId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}-${performance.now().toString(36).replace('.', '')}`;
  }

  function cleanDetails(details) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
    return Object.fromEntries(Object.entries(details).flatMap(([key, value]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key)) return [];
      if (typeof value === 'string') return [[key, value.slice(0, 80)]];
      if (typeof value === 'boolean' || finiteInteger(value)) return [[key, value]];
      return [];
    }));
  }

  function safePersist(key, value) {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Round reporting is optional when storage is blocked or unavailable.
    }
  }

  function createRound(options) {
    const gameId = String(options?.gameId || '');
    const gameVersion = String(options?.gameVersion || '');
    const durationSeconds = Number(options?.durationSeconds);
    const maximumLegitimateScore = Number(options?.maximumLegitimateScore);
    if (!/^[a-z0-9-]{2,40}$/.test(gameId)) throw new TypeError('Invalid game ID');
    if (!gameVersion || gameVersion.length > 40) throw new TypeError('Invalid game version');
    if (!finiteInteger(durationSeconds) || durationSeconds <= 0) throw new TypeError('Invalid round duration');
    if (!finiteInteger(maximumLegitimateScore) || maximumLegitimateScore <= 0) {
      throw new TypeError('Invalid legitimate score ceiling');
    }

    const sessionId = createSessionId();
    const startedAt = new Date().toISOString();
    const startedEpochMs = Date.now();
    const startedMonotonicMs = performance.now();
    const fullDurationOutcomes = new Set((options.fullDurationOutcomes || []).map(String));
    const actions = new Map();
    const rejectedEvents = [];
    let score = 0;
    let completed = false;
    let finalSummary = null;

    function reject(reason, type, points) {
      rejectedEvents.push({
        reason,
        type: String(type || '').slice(0, 40),
        points: finiteInteger(points) ? points : null,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedMonotonicMs))
      });
      return false;
    }

    function award(type, points, details = {}) {
      if (completed) return reject('round-completed', type, points);
      if (!/^[a-z][a-z0-9-]{1,39}$/.test(String(type))) return reject('invalid-event-type', type, points);
      if (!finiteInteger(points) || points <= 0) return reject('invalid-points', type, points);
      if (!finiteInteger(score + points) || score + points > maximumLegitimateScore) {
        return reject('impossible-score', type, points);
      }

      score += points;
      const key = String(type);
      const elapsedMs = Math.max(0, Math.round(performance.now() - startedMonotonicMs));
      const existing = actions.get(key) || {
        count: 0,
        points: 0,
        firstElapsedMs: elapsedMs,
        lastElapsedMs: elapsedMs,
        samples: []
      };
      existing.count++;
      existing.points += points;
      existing.lastElapsedMs = elapsedMs;
      if (existing.samples.length < 5) existing.samples.push(cleanDetails(details));
      actions.set(key, existing);
      return true;
    }

    function pointsFor(type) {
      return actions.get(type)?.points || 0;
    }

    function actionSummary() {
      return Object.fromEntries([...actions.entries()].map(([type, value]) => [type, {
        count: value.count,
        points: value.points,
        firstElapsedMs: value.firstElapsedMs,
        lastElapsedMs: value.lastElapsedMs,
        samples: value.samples
      }]));
    }

    function validateScore(candidate = score) {
      if (!finiteInteger(candidate)) return { valid: false, reason: 'score-must-be-a-finite-integer' };
      if (candidate < 0) return { valid: false, reason: 'score-must-not-be-negative' };
      if (candidate > maximumLegitimateScore) return { valid: false, reason: 'score-exceeds-legitimate-ceiling' };
      return { valid: true, reason: null };
    }

    function finalize({ outcome, elapsedSeconds, facts = {} } = {}) {
      if (finalSummary) return finalSummary;
      const validation = validateScore();
      const safeElapsed = Number(elapsedSeconds);
      const elapsedValid = Number.isFinite(safeElapsed)
        && safeElapsed >= 0
        && safeElapsed <= durationSeconds + 1;
      completed = true;
      const completedAt = new Date().toISOString();
      const wallDurationMs = Math.max(0, Date.now() - startedEpochMs);
      const outcomeName = String(outcome || 'unknown').slice(0, 40);
      const requiresFullDuration = fullDurationOutcomes.has(outcomeName);
      const completionTimeValid = !requiresFullDuration
        || (safeElapsed >= durationSeconds - 1 && wallDurationMs >= (durationSeconds - 2) * 1000);
      finalSummary = {
        formatVersion: FORMAT_VERSION,
        sessionId,
        gameId,
        gameVersion,
        startedAt,
        completedAt,
        configuredDurationSeconds: durationSeconds,
        elapsedSeconds: elapsedValid ? Math.round(safeElapsed * 1000) / 1000 : null,
        wallDurationMs,
        outcome: outcomeName,
        finalScore: validation.valid ? score : null,
        valid: validation.valid && elapsedValid && completionTimeValid && rejectedEvents.length === 0,
        validationErrors: [
          ...(validation.valid ? [] : [validation.reason]),
          ...(elapsedValid ? [] : ['invalid-elapsed-time']),
          ...(completionTimeValid ? [] : ['completion-too-fast']),
          ...(rejectedEvents.length ? ['rejected-score-events'] : [])
        ],
        maximumLegitimateScore,
        actions: actionSummary(),
        rejectedEvents: rejectedEvents.slice(0, 20),
        facts: cleanDetails(facts)
      };
      safePersist(options.summaryStorageKey, finalSummary);
      return finalSummary;
    }

    return Object.freeze({
      sessionId,
      award,
      finalize,
      getScore: () => score,
      pointsFor,
      actionSummary,
      validateScore
    });
  }

  window.FarmLeagueScore = Object.freeze({ createRound, formatVersion: FORMAT_VERSION });
})();

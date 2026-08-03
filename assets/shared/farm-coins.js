(() => {
  'use strict';

  const STORAGE_KEY = 'farmLeague.coins.v1';
  const FARM_STORAGE_KEY = 'farmLeague.myFarm.v2';
  const LEGACY_FARM_STORAGE_KEY = 'farmLeague.myFarm.v1';
  const VERSION = 1;
  const STARTING_BALANCE = 250;
  const MAXIMUM_BALANCE = 999999;
  const MAXIMUM_LEDGER_ENTRIES = 100;
  const MAXIMUM_REWARDED_SESSIONS = 500;

  function safeInteger(value, fallback = 0) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAXIMUM_BALANCE ? value : fallback;
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function initialBalance() {
    const farm = readJson(FARM_STORAGE_KEY);
    if (Number.isSafeInteger(farm?.coins)) return safeInteger(farm.coins, STARTING_BALANCE);
    const legacyFarm = readJson(LEGACY_FARM_STORAGE_KEY);
    return safeInteger(legacyFarm?.coins, STARTING_BALANCE);
  }

  function defaultState() {
    return {
      version: VERSION,
      balance: initialBalance(),
      rewardedSessionIds: [],
      firstRuns: {},
      ledger: []
    };
  }

  function normaliseState(value) {
    if (!value || value.version !== VERSION) return defaultState();
    const sessionIds = Array.isArray(value.rewardedSessionIds)
      ? value.rewardedSessionIds.filter(id => typeof id === 'string' && /^[a-z0-9-]{8,100}$/i.test(id))
      : [];
    const firstRuns = value.firstRuns && typeof value.firstRuns === 'object'
      ? Object.fromEntries(Object.entries(value.firstRuns).filter(([id, completed]) =>
        /^[a-z0-9-]{2,40}$/.test(id) && completed === true))
      : {};
    const ledger = Array.isArray(value.ledger)
      ? value.ledger.filter(entry => entry && typeof entry === 'object').slice(-MAXIMUM_LEDGER_ENTRIES)
      : [];
    return {
      version: VERSION,
      balance: safeInteger(value.balance, initialBalance()),
      rewardedSessionIds: [...new Set(sessionIds)].slice(-MAXIMUM_REWARDED_SESSIONS),
      firstRuns,
      ledger
    };
  }

  function load() {
    return normaliseState(readJson(STORAGE_KEY));
  }

  function persist(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function getBalance() {
    return load().balance;
  }

  function spend(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) return false;
    const state = load();
    if (state.balance < amount) return false;
    state.balance -= amount;
    return persist(state);
  }

  function rewardRound(summary, { previousBest = 0 } = {}) {
    const state = load();
    const originalBalance = state.balance;
    const invalid = reason => Object.freeze({ awarded: false, coins: 0, balance: state.balance, breakdown: {}, reason });
    if (!summary?.valid) return invalid('invalid-round');
    if (!/^[a-z0-9-]{2,40}$/.test(summary.gameId || '')) return invalid('invalid-game');
    if (!/^[a-z0-9-]{8,100}$/i.test(summary.sessionId || '')) return invalid('invalid-session');
    if (!Number.isSafeInteger(summary.finalScore) || summary.finalScore < 0) return invalid('invalid-score');
    if (!Number.isFinite(summary.elapsedSeconds) || summary.elapsedSeconds < 30) return invalid('round-too-short');
    if (state.rewardedSessionIds.includes(summary.sessionId)) return invalid('already-rewarded');

    const elapsed = summary.elapsedSeconds;
    const duration = Number(summary.configuredDurationSeconds) || 120;
    const breakdown = {
      thirtySeconds: 2,
      sixtySeconds: elapsed >= 60 ? 2 : 0,
      fullRound: elapsed >= duration - 1 ? 2 : 0,
      firstRun: state.firstRuns[summary.gameId] ? 0 : 3,
      personalBest: Number.isSafeInteger(previousBest) && previousBest > 0 && summary.finalScore > previousBest ? 3 : 0
    };
    const requestedCoins = Object.values(breakdown).reduce((total, coins) => total + coins, 0);
    const coins = Math.min(requestedCoins, MAXIMUM_BALANCE - state.balance);
    state.balance += coins;
    state.firstRuns[summary.gameId] = true;
    state.rewardedSessionIds.push(summary.sessionId);
    state.rewardedSessionIds = state.rewardedSessionIds.slice(-MAXIMUM_REWARDED_SESSIONS);
    state.ledger.push({
      sessionId: summary.sessionId,
      gameId: summary.gameId,
      awardedAt: new Date().toISOString(),
      elapsedSeconds: summary.elapsedSeconds,
      score: summary.finalScore,
      coins,
      breakdown
    });
    state.ledger = state.ledger.slice(-MAXIMUM_LEDGER_ENTRIES);
    if (!persist(state)) return Object.freeze({
      awarded: false,
      coins: 0,
      balance: originalBalance,
      breakdown: {},
      reason: 'storage-unavailable'
    });
    return Object.freeze({ awarded: true, coins, balance: state.balance, breakdown: Object.freeze(breakdown), reason: null });
  }

  window.FarmLeagueCoins = Object.freeze({
    storageKey: STORAGE_KEY,
    version: VERSION,
    getBalance,
    spend,
    rewardRound
  });
})();

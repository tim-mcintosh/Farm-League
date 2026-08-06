(() => {
  'use strict';

  const auth = window.FarmLeagueAuth;

  async function beginRound() {
    await auth?.ready;
    return Object.freeze({ userId: auth?.getUser()?.id || null });
  }

  async function submitRound(summary, roundContext) {
    await auth?.ready;
    const user = auth?.getUser();
    if (!user || !roundContext?.userId || user.id !== roundContext.userId) {
      return { saved: false, reason: 'not-signed-in-for-entire-round' };
    }
    if (!summary?.valid) return { saved: false, reason: 'invalid-round' };
    try {
      const { data, error } = await auth.client.functions.invoke('submit-score', { body: { summary } });
      if (error) return { saved: false, reason: 'submission-failed', error };
      return { saved: true, bestScore: data.bestScore, score: data.score };
    } catch (error) {
      return { saved: false, reason: 'network-error', error };
    }
  }

  async function loadBestScores() {
    await auth?.ready;
    if (!auth?.getUser()) return [];
    const { data, error } = await auth.client
      .from('best_scores')
      .select('game_id,score,game_version,updated_at')
      .order('game_id');
    if (error) throw error;
    return data || [];
  }

  async function renderSubmission(summary, roundContext, element) {
    if (!element) return;
    if (!roundContext?.userId) {
      element.textContent = 'Guest — local only';
      return;
    }
    element.textContent = 'Saving…';
    const result = await submitRound(summary, roundContext);
    element.textContent = result.saved
      ? `Saved · Best ${Number(result.bestScore || 0).toLocaleString()}`
      : 'Could not sync · saved locally';
  }

  window.FarmLeagueCloudScores = Object.freeze({ beginRound, submitRound, loadBestScores, renderSubmission });
})();

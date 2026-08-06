(() => {
  'use strict';
  const names = {
    'tractor-dash': 'Tractor Dash',
    'feed-run': 'Feed Run',
    'order-rush': 'Order Rush',
    'fence-frenzy': 'Fence Frenzy'
  };
  const auth = window.FarmLeagueAuth;
  const scores = document.getElementById('cloudScores');
  const status = document.getElementById('profileStatus');

  async function initialise() {
    await auth.ready;
    const user = auth.getUser();
    if (!user) {
      location.replace('../account/index.html');
      return;
    }
    document.getElementById('profileEmail').textContent = user.email;
    try {
      const saved = await window.FarmLeagueCloudScores.loadBestScores();
      const byGame = new Map(saved.map(score => [score.game_id, score]));
      scores.replaceChildren(...Object.entries(names).map(([gameId, name]) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        const label = document.createElement('span');
        const value = document.createElement('strong');
        label.textContent = name;
        value.textContent = (byGame.get(gameId)?.score || 0).toLocaleString();
        row.append(label, value);
        return row;
      }));
    } catch {
      scores.textContent = 'Cloud scores are unavailable. Your local games still work.';
    }
  }

  document.getElementById('signOutButton').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      await auth.signOut();
      location.replace('../index.html');
    } catch (error) {
      status.textContent = error?.message || 'Could not sign out.';
      event.currentTarget.disabled = false;
    }
  });
  initialise();
})();

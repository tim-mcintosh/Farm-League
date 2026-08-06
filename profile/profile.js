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
  const form = document.getElementById('profileForm');
  const saveButton = document.getElementById('saveProfileButton');

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  async function initialise() {
    await auth.ready;
    const user = auth.getUser();
    if (!user) {
      location.replace('../account/index.html');
      return;
    }
    document.getElementById('profileEmail').value = user.email || '';
    try {
      const { data: profile, error: profileError } = await auth.client
        .from('profiles')
        .select('username,full_name')
        .single();
      if (profileError) throw profileError;
      document.getElementById('profileUsername').value = profile.username || '';
      document.getElementById('profileFullName').value = profile.full_name || '';

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
    } catch (error) {
      scores.textContent = 'Cloud account data is unavailable. Your local games still work.';
      showStatus(error?.message || 'Could not load your profile.', true);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const user = auth.getUser();
    if (!user) return;
    const username = document.getElementById('profileUsername').value.trim().toLowerCase();
    const fullName = document.getElementById('profileFullName').value.trim();
    saveButton.disabled = true;
    showStatus('Saving profile…');
    try {
      const { error } = await auth.client.from('profiles').update({
        username,
        full_name: fullName || null
      }).eq('user_id', user.id);
      if (error) throw error;
      document.getElementById('profileUsername').value = username;
      showStatus('Profile saved.');
    } catch (error) {
      showStatus(error?.code === '23505' ? 'That username is already taken.' : (error?.message || 'Could not save your profile.'), true);
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById('signOutButton').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      await auth.signOut();
      location.replace('../index.html');
    } catch (error) {
      showStatus(error?.message || 'Could not sign out.', true);
      event.currentTarget.disabled = false;
    }
  });
  initialise();
})();

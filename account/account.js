(() => {
  'use strict';

  const auth = window.FarmLeagueAuth;
  const form = document.getElementById('accountForm');
  const title = document.getElementById('accountTitle');
  const submit = document.getElementById('accountSubmit');
  const status = document.getElementById('accountStatus');
  const usernameField = document.getElementById('usernameField');
  const tabs = [...document.querySelectorAll('[data-account-mode]')];
  let mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'signin';

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function setMode(nextMode) {
    mode = nextMode;
    const signingUp = mode === 'signup';
    title.textContent = signingUp ? 'Create your account' : 'Welcome back';
    submit.textContent = signingUp ? 'Create account' : 'Sign in';
    usernameField.hidden = !signingUp;
    form.elements.username.disabled = !signingUp;
    form.elements.password.autocomplete = signingUp ? 'new-password' : 'current-password';
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.accountMode === mode)));
    showStatus('');
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.accountMode)));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    submit.disabled = true;
    showStatus(mode === 'signup' ? 'Creating your account…' : 'Signing in…');
    try {
      const { data, error } = mode === 'signup'
        ? await auth.signUp(email, password, username)
        : await auth.signIn(email, password);
      if (error) throw error;
      if (mode === 'signup' && !data.session) {
        form.reset();
        showStatus('Check your email and follow the confirmation link to finish signing up.');
      } else {
        location.href = '../profile/index.html';
      }
    } catch (error) {
      showStatus(error?.message || 'Account request failed. Please try again.', true);
    } finally {
      submit.disabled = false;
    }
  });

  auth.ready.then(session => {
    if (session) location.href = '../profile/index.html';
    else if (new URLSearchParams(location.search).has('confirmed')) showStatus('Email confirmed. You can now sign in.');
  });
  setMode(mode);
})();

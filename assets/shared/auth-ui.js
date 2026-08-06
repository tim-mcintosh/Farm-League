(() => {
  'use strict';

  const auth = window.FarmLeagueAuth;
  if (!auth) return;

  function render() {
    const user = auth.getUser();
    document.querySelectorAll('[data-auth-link]').forEach(link => {
      link.textContent = user ? 'Profile' : 'Sign in';
      link.href = user ? link.dataset.profileHref : link.dataset.signInHref;
    });
    document.querySelectorAll('[data-signed-in-email]').forEach(element => {
      element.textContent = user?.email || '';
    });
  }

  auth.ready.then(render);
  document.addEventListener('farmleague:authchange', render);
})();

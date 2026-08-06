(() => {
  'use strict';
  const status = document.getElementById('accountStatus');
  const show = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  document.getElementById('forgotForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await window.FarmLeagueAuth.requestPasswordReset(event.currentTarget.elements.email.value.trim());
      if (error) throw error;
      show('If an account exists for that email, a reset link has been sent.');
      event.currentTarget.reset();
    } catch (error) {
      show(error?.message || 'Could not request a reset link.', true);
    } finally { button.disabled = false; }
  });
  document.getElementById('resetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const { password, confirmation } = event.currentTarget.elements;
    if (password.value !== confirmation.value) return show('Passwords do not match.', true);
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await window.FarmLeagueAuth.updatePassword(password.value);
      if (error) throw error;
      show('Password updated. Taking you to your profile…');
      setTimeout(() => { location.href = '../profile/index.html'; }, 800);
    } catch (error) {
      show(error?.message || 'Could not update your password.', true);
    } finally { button.disabled = false; }
  });
})();

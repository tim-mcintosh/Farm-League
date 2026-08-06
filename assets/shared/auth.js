(() => {
  'use strict';

  const config = window.FARM_LEAGUE_SUPABASE_CONFIG;
  const sdk = window.supabase;
  const ownScript = document.querySelector('script[src$="/assets/shared/auth.js"], script[src="assets/shared/auth.js"]');
  const siteRoot = ownScript ? new URL('../../', ownScript.src) : new URL('/', location.href);
  const client = config && sdk?.createClient
    ? sdk.createClient(config.projectUrl, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;
  let session = null;

  const ready = client
    ? client.auth.getSession().then(({ data }) => {
      session = data.session;
      return session;
    }).catch(() => null)
    : Promise.resolve(null);

  if (client) {
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      document.dispatchEvent(new CustomEvent('farmleague:authchange', { detail: { session } }));
    });
  }

  async function signUp(email, password, username = '') {
    if (!client) throw new Error('Account service is unavailable.');
    return client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL('account/index.html?confirmed=1', siteRoot).href,
        data: { username: String(username).trim() || null }
      }
    });
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Account service is unavailable.');
    return client.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function requestPasswordReset(email) {
    if (!client) throw new Error('Account service is unavailable.');
    return client.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('account/reset-password.html', siteRoot).href
    });
  }

  async function updatePassword(password) {
    if (!client) throw new Error('Account service is unavailable.');
    return client.auth.updateUser({ password });
  }

  window.FarmLeagueAuth = Object.freeze({
    client,
    ready,
    getSession: () => session,
    getUser: () => session?.user || null,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword
  });
})();

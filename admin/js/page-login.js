import { firebase, isFirebaseConfigured, toEmail, errorText, ADMIN_OPTIONS } from './firebase.js';
import { readProfile, writeProfile, touchSignIn } from './store.js';
import { $, banner, el } from './ui.js';

const form = $('#login-form');
const notice = $('#notice');
const submit = $('#submit');
const bootstrapButton = $('#bootstrap');

const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
const safeNext = /^[a-z-]+\.html$/i.test(next) ? next : 'dashboard.html';

if (!isFirebaseConfigured()) {
  document.body.innerHTML = '';
  document.body.append(el('div', { class: 'setup', html: `
    <h1>Firebase is not connected yet</h1>
    <p>Open <code>firebase-config.js</code> in the project root and paste the values from
    Firebase console → Project settings → Your apps → Web app. Then reload this page.</p>
    <p>The TV display keeps working from <code>data/timetable.xlsx</code> in the meantime.</p>` }));
} else {
  start();
}

async function start() {
  const { auth, authSdk } = await firebase();
  authSdk.onAuthStateChanged(auth, user => {
    // A signed-in administrator who opens /admin/ goes straight through.
    if (user) location.replace(safeNext);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const username = $('#username').value.trim();
    const password = $('#password').value;
    if (!username || !password) return;
    banner(notice, '');
    bootstrapButton.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const credential = await authSdk.signInWithEmailAndPassword(auth, toEmail(username), password);
      const profile = await readProfile(credential.user.uid);
      if (profile?.active === false) {
        await authSdk.signOut(auth);
        banner(notice, 'This account has been disabled. Ask an administrator to enable it.');
        return;
      }
      if (!profile) {
        await authSdk.signOut(auth);
        banner(notice, 'This sign-in has no account record in Firestore. Ask an administrator to add you on the Users page.');
        return;
      }
      touchSignIn(credential.user.uid);
      location.replace(safeNext);
    } catch (error) {
      const missing = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(error.code);
      banner(notice, errorText(error));
      if (missing && ADMIN_OPTIONS.BOOTSTRAP_USERNAME && username.toLowerCase() === ADMIN_OPTIONS.BOOTSTRAP_USERNAME.toLowerCase()) {
        bootstrapButton.hidden = false;
      }
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  // First run only: creates the administrator account named in firebase-config.js.
  bootstrapButton.addEventListener('click', async () => {
    const username = $('#username').value.trim();
    const password = $('#password').value;
    if (password.length < 6) { banner(notice, 'Choose a password of at least 6 characters first.'); return; }
    bootstrapButton.disabled = true;
    try {
      const credential = await authSdk.createUserWithEmailAndPassword(auth, toEmail(username), password);
      await writeProfile(credential.user.uid, {
        name: 'System Administrator',
        username: username.toLowerCase(),
        email: credential.user.email,
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      });
      location.replace('dashboard.html');
    } catch (error) {
      banner(notice, [
        errorText(error),
        'If Firestore refused the write, publish firestore.rules with your bootstrap email in the isBootstrap() check.'
      ]);
      bootstrapButton.disabled = false;
    }
  });
}

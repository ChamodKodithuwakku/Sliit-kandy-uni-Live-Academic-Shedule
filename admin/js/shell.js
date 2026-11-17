// Draws the sidebar, guards the page behind Firebase Authentication and hands
// the page script a signed-in user with a role.
import { firebase, isFirebaseConfigured, toUsername, errorText, ADMIN_OPTIONS } from './firebase.js';
import { readProfile, setAuthor, touchSignIn } from './store.js';
import { el, icon, $, toast } from './ui.js';

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard' },
  { id: 'timetable', label: 'Timetable', href: 'timetable.html', icon: 'calendar' },
  { id: 'exams', label: 'Exam Timetable', href: 'exams.html', icon: 'exam' },
  { id: 'arrangement', label: 'Display Arrangement', href: 'arrangement.html', icon: 'layers', adminOnly: true },
  { id: 'media', label: 'Campus Media', href: 'media.html', icon: 'media', adminOnly: true },
  { id: 'settings', label: 'Display Settings', href: 'settings.html', icon: 'settings', adminOnly: true },
  { id: 'users', label: 'Users', href: 'users.html', icon: 'users', adminOnly: true }
];

export const DISPLAY_URL = '../index.html';

function setupScreen() {
  document.body.innerHTML = '';
  document.body.append(el('div', { class: 'setup' , html: `
    <h1>Connect Firebase to finish the setup</h1>
    <p>The admin panel and the TV display both read from your own Firebase project. Nothing is stored anywhere else.</p>
    <ol>
      <li>Create a project at <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>.</li>
      <li>Add a <strong>Web app</strong> and copy the <code>firebaseConfig</code> values.</li>
      <li>Paste them into <code>firebase-config.js</code> in the project root.</li>
      <li>In the console, turn on <strong>Authentication → Email/Password</strong> and create a <strong>Cloud Firestore</strong> database.</li>
      <li>Publish the rules from <code>firestore.rules</code>, then reload this page.</li>
    </ol>
    <pre><code>export const FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:abcdef'
};</code></pre>
    <p>Until then the TV display keeps running from <code>data/timetable.xlsx</code>, exactly as before.</p>
  `}));
}

function sidebar(page, profile) {
  const isAdmin = profile.role === 'admin';
  const nav = el('nav', { class: 'sidebar-nav' });
  for (const item of NAV) {
    if (item.adminOnly && !isAdmin) continue;
    nav.append(el('a', {
      href: item.href,
      class: item.id === page ? 'active' : '',
      html: `${icon(item.icon)}<span>${item.label}</span>`
    }));
  }
  nav.append(el('div', { class: 'nav-sep' }));
  nav.append(el('a', {
    href: DISPLAY_URL, target: '_blank', rel: 'noopener', class: 'external',
    html: `<span>Open TV Display</span>${icon('external')}`
  }));

  return el('aside', { class: 'sidebar' }, [
    el('div', { class: 'sidebar-brand', html: `
      <img src="../assets/logo.png" alt="SLIIT Kandy UNI">
      <div class="brand-text"><strong>Digital Signage</strong><span>Administration</span></div>` }),
    nav,
    el('div', { class: 'sidebar-foot' }, [
      el('div', { class: 'who', text: profile.name || profile.username }),
      el('div', { class: 'role', text: profile.role === 'admin' ? 'Administrator' : 'Editor' }),
      el('button', { type: 'button', text: 'Sign out', onClick: () => signOutNow() })
    ])
  ]);
}

export async function signOutNow() {
  try {
    const { auth, authSdk } = await firebase();
    await authSdk.signOut(auth);
  } catch { /* leaving the page is enough */ }
  location.href = 'index.html';
}

/**
 * Call once at the top of every admin page.
 * Resolves with { user, profile, isAdmin } after the sidebar is on screen.
 */
export function mountShell(page, { requireAdmin = false } = {}) {
  return new Promise(resolve => {
    if (!isFirebaseConfigured()) { setupScreen(); return; }

    firebase().then(({ auth, authSdk }) => {
      authSdk.onAuthStateChanged(auth, async user => {
        if (!user) {
          location.replace(`index.html?next=${encodeURIComponent(location.pathname.split('/').pop() || 'dashboard.html')}`);
          return;
        }
        let profile;
        try {
          profile = await readProfile(user.uid);
        } catch (error) {
          toast(errorText(error), 'err', 6000);
          return;
        }
        if (!profile) {
          toast('This sign-in has no account record. Ask an administrator to add you.', 'err', 7000);
          setTimeout(signOutNow, 2500);
          return;
        }
        if (profile.active === false) {
          toast('This account has been disabled.', 'err', 6000);
          setTimeout(signOutNow, 2000);
          return;
        }
        profile.username = profile.username || toUsername(user.email);
        setAuthor(profile.username);
        touchSignIn(user.uid);

        const isAdmin = profile.role === 'admin';
        if (requireAdmin && !isAdmin) {
          document.body.innerHTML = '';
          document.body.append(el('div', { class: 'setup', html: `
            <h1>Administrator only</h1>
            <p>Campus Media, Display Settings, Display Arrangement and User Management are restricted to administrators.
            Your account can manage the weekly timetable and the exam timetable.</p>
            <p><a class="btn btn-blue" href="timetable.html" style="display:inline-flex;margin-top:10px">Go to the timetable</a></p>` }));
          return;
        }

        document.body.prepend(el('button', {
          class: 'nav-toggle', type: 'button', 'aria-label': 'Menu',
          html: icon('menu'),
          onClick: () => document.body.classList.toggle('nav-open')
        }));
        const shell = $('.shell') || document.body;
        shell.prepend(sidebar(page, profile));
        shell.append(el('div', { class: 'nav-scrim', onClick: () => document.body.classList.remove('nav-open') }));
        for (const node of document.querySelectorAll('[data-campus]')) node.textContent = ADMIN_OPTIONS.CAMPUS_NAME;
        const main = $('.main');
        if (main) main.hidden = false;
        resolve({ user, profile, isAdmin, uid: user.uid });
      });
    }).catch(error => {
      document.body.innerHTML = '';
      document.body.append(el('div', { class: 'setup', html: `<h1>Firebase could not start</h1><p>${errorText(error)}</p>` }));
    });
  });
}

/** Standard "Preview Display" button for the page header. */
export function previewButton() {
  return el('a', { class: 'btn', href: DISPLAY_URL, target: '_blank', rel: 'noopener', html: `${icon('external')}<span>Preview Display</span>` });
}

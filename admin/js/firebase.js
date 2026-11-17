// Loads the Firebase modular SDK on demand and hands back ready-made handles.
// Every other admin module talks to Firebase through this one file.
import { FIREBASE_CONFIG, FIREBASE_SDK, ADMIN_OPTIONS, isFirebaseConfigured } from '../../firebase-config.js';

export { FIREBASE_CONFIG, FIREBASE_SDK, ADMIN_OPTIONS, isFirebaseConfigured };

let booted;

async function boot() {
  if (!isFirebaseConfigured()) throw new Error('FIREBASE_NOT_CONFIGURED');
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`)
  ]);
  const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getFirestore(app);
  await authSdk.setPersistence(auth, authSdk.browserLocalPersistence).catch(() => {});
  return { app, auth, db, appSdk, authSdk, dbSdk };
}

export function firebase() {
  if (!booted) booted = boot();
  return booted;
}

// Firebase Storage is only pulled in when a logo is actually uploaded.
let storageBooted;
export function storage() {
  if (!storageBooted) {
    storageBooted = (async () => {
      const { app } = await firebase();
      const sdk = await import(`${FIREBASE_SDK}/firebase-storage.js`);
      return { sdk, bucket: sdk.getStorage(app) };
    })();
  }
  return storageBooted;
}

// A second, isolated app instance. Creating a user signs that user in, which
// would kick the administrator out of their own session — doing it on a
// secondary app keeps the administrator signed in on the main one.
export async function secondaryAuth() {
  const { appSdk, authSdk } = await firebase();
  const name = 'admin-user-factory';
  const app = appSdk.getApps().find(a => a.name === name) || appSdk.initializeApp(FIREBASE_CONFIG, name);
  return { auth: authSdk.getAuth(app), authSdk, app, appSdk };
}

export function toEmail(usernameOrEmail) {
  const value = String(usernameOrEmail || '').trim();
  if (!value) return '';
  if (value.includes('@')) return value.toLowerCase();
  return `${value.toLowerCase()}@${ADMIN_OPTIONS.USERNAME_DOMAIN}`;
}

export function toUsername(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return '';
  return value.endsWith(`@${ADMIN_OPTIONS.USERNAME_DOMAIN}`) ? value.split('@')[0] : value;
}

const MESSAGES = {
  'auth/invalid-credential': 'Username or password is incorrect.',
  'auth/invalid-login-credentials': 'Username or password is incorrect.',
  'auth/wrong-password': 'Username or password is incorrect.',
  'auth/user-not-found': 'No account exists for that username.',
  'auth/invalid-email': 'That username contains characters Firebase cannot use.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/email-already-in-use': 'That username is already taken.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/network-request-failed': 'No connection to Firebase. Check the network.',
  'auth/operation-not-allowed': 'Enable Email/Password sign-in in the Firebase console.',
  'auth/requires-recent-login': 'Sign out and back in before changing this.',
  'permission-denied': 'Your account is not allowed to make that change.',
  'unavailable': 'Firebase is unreachable right now. Try again in a moment.',
  'failed-precondition': 'Firestore rejected the request. Check the database rules.',
  FIREBASE_NOT_CONFIGURED: 'Firebase is not connected yet. Fill in firebase-config.js.'
};

export function errorText(error) {
  const code = error?.code || error?.message || '';
  return MESSAGES[code] || error?.message?.replace(/^Firebase:\s*/, '') || 'Something went wrong.';
}

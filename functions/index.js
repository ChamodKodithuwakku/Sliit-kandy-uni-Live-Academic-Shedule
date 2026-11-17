/**
 * OPTIONAL. Deploy these only if you want administrators to change another
 * user's password, or to remove the Authentication login (not just the
 * Firestore record) when deleting an account. Everything else in the admin
 * panel works without them.
 *
 *   npm --prefix functions install
 *   firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

async function requireAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snapshot = await admin.firestore().doc(`users/${uid}`).get();
  const profile = snapshot.data();
  if (!snapshot.exists || profile.active === false || profile.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrators only.');
  }
  return uid;
}

exports.adminSetPassword = onCall(async request => {
  await requireAdmin(request);
  const { uid, password } = request.data || {};
  if (!uid || typeof password !== 'string' || password.length < 6) {
    throw new HttpsError('invalid-argument', 'A user id and a password of at least 6 characters are required.');
  }
  await admin.auth().updateUser(uid, { password });
  return { ok: true };
});

exports.adminDeleteUser = onCall(async request => {
  const callerUid = await requireAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'A user id is required.');
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  await admin.auth().deleteUser(uid).catch(error => {
    if (error.code !== 'auth/user-not-found') throw error;
  });
  await admin.firestore().doc(`users/${uid}`).delete();
  return { ok: true };
});

exports.adminSetDisabled = onCall(async request => {
  const callerUid = await requireAdmin(request);
  const { uid, disabled } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'A user id is required.');
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'You cannot disable your own account.');
  await admin.auth().updateUser(uid, { disabled: Boolean(disabled) });
  await admin.firestore().doc(`users/${uid}`).set({ active: !disabled }, { merge: true });
  return { ok: true };
});

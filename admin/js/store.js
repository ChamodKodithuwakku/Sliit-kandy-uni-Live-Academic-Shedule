// Every Firestore read and write the admin panel performs.
import { firebase, ADMIN_OPTIONS } from './firebase.js';
import { DEFAULT_SETTINGS, DEFAULT_ARRANGEMENT } from '../../js/schema.js';

const NAMES = ADMIN_OPTIONS.COLLECTIONS;
let signedInAs = '';

export function setAuthor(username) { signedInAs = username || ''; }

function stamp(extra = {}) {
  return { ...extra, updatedAt: new Date().toISOString(), updatedBy: signedInAs };
}

/** Live list. Returns an unsubscribe function. */
export async function watch(collectionName, onData, onError) {
  const { db, dbSdk } = await firebase();
  return dbSdk.onSnapshot(
    dbSdk.collection(db, collectionName),
    snapshot => onData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
    error => onError?.(error)
  );
}

export async function listAll(collectionName) {
  const { db, dbSdk } = await firebase();
  const snapshot = await dbSdk.getDocs(dbSdk.collection(db, collectionName));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function create(collectionName, data) {
  const { db, dbSdk } = await firebase();
  const ref = await dbSdk.addDoc(dbSdk.collection(db, collectionName), stamp({ ...data, createdAt: new Date().toISOString() }));
  return ref.id;
}

export async function update(collectionName, id, data) {
  const { db, dbSdk } = await firebase();
  await dbSdk.updateDoc(dbSdk.doc(db, collectionName, id), stamp(data));
}

export async function remove(collectionName, id) {
  const { db, dbSdk } = await firebase();
  await dbSdk.deleteDoc(dbSdk.doc(db, collectionName, id));
}

/** Bulk insert, in batches Firestore accepts. Returns how many were written. */
export async function createMany(collectionName, items) {
  const { db, dbSdk } = await firebase();
  let written = 0;
  for (let index = 0; index < items.length; index += 400) {
    const chunk = items.slice(index, index + 400);
    const batch = dbSdk.writeBatch(db);
    for (const item of chunk) {
      batch.set(dbSdk.doc(dbSdk.collection(db, collectionName)), stamp({ ...item, createdAt: new Date().toISOString() }));
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

/** Writes many documents at once — used by the arrangement and media ordering. */
export async function writeBatch(operations) {
  const { db, dbSdk } = await firebase();
  const batch = dbSdk.writeBatch(db);
  for (const op of operations) {
    const ref = dbSdk.doc(db, op.collection, op.id);
    if (op.type === 'delete') batch.delete(ref);
    else batch.update(ref, stamp(op.data));
  }
  await batch.commit();
}

// ---------------------------------------------------------------- settings

async function settingsRef(name) {
  const { db, dbSdk } = await firebase();
  return { ref: dbSdk.doc(db, NAMES.settings, name), dbSdk };
}

export async function readSettings() {
  const { ref, dbSdk } = await settingsRef('display');
  const snapshot = await dbSdk.getDoc(ref);
  return { ...DEFAULT_SETTINGS, dataSource: ADMIN_OPTIONS.DEFAULT_DATA_SOURCE, ...(snapshot.exists() ? snapshot.data() : {}) };
}

export async function saveSettings(values) {
  const { ref, dbSdk } = await settingsRef('display');
  await dbSdk.setDoc(ref, stamp(values), { merge: true });
}

export async function watchSettings(onData, onError) {
  const { ref, dbSdk } = await settingsRef('display');
  return dbSdk.onSnapshot(ref,
    snapshot => onData({ ...DEFAULT_SETTINGS, ...(snapshot.exists() ? snapshot.data() : {}) }),
    error => onError?.(error));
}

export async function readArrangement() {
  const { ref, dbSdk } = await settingsRef('arrangement');
  const snapshot = await dbSdk.getDoc(ref);
  const stored = snapshot.exists() ? snapshot.data() : {};
  const sequence = Array.isArray(stored.sequence) && stored.sequence.length ? stored.sequence : DEFAULT_ARRANGEMENT.sequence;
  return { ...DEFAULT_ARRANGEMENT, ...stored, sequence: sequence.map(item => ({ ...item })) };
}

export async function saveArrangement(values) {
  const { ref, dbSdk } = await settingsRef('arrangement');
  await dbSdk.setDoc(ref, stamp(values), { merge: true });
}

// ------------------------------------------------------------------- users

export async function readProfile(uid) {
  const { db, dbSdk } = await firebase();
  const snapshot = await dbSdk.getDoc(dbSdk.doc(db, NAMES.users, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function writeProfile(uid, data, merge = true) {
  const { db, dbSdk } = await firebase();
  await dbSdk.setDoc(dbSdk.doc(db, NAMES.users, uid), stamp(data), { merge });
}

export async function countUsers() {
  const { db, dbSdk } = await firebase();
  const snapshot = await dbSdk.getDocs(dbSdk.query(dbSdk.collection(db, NAMES.users), dbSdk.limit(1)));
  return snapshot.size;
}

export async function touchSignIn(uid) {
  const { db, dbSdk } = await firebase();
  await dbSdk.setDoc(dbSdk.doc(db, NAMES.users, uid), { lastSignIn: new Date().toISOString() }, { merge: true })
    .catch(() => {});
}

export const COLLECTIONS = NAMES;

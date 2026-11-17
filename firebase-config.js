// ---------------------------------------------------------------------------
// FIREBASE CONNECTION — fill this in once, then both the admin panel and the
// TV display read live data from your Firebase project.
//
// Firebase console -> Project settings -> General -> Your apps -> Web app
// Copy the "firebaseConfig" values into FIREBASE_CONFIG below.
//
// Nothing else in the project needs editing. While the keys are empty the TV
// display keeps using ./data/timetable.xlsx and the admin panel shows setup
// instructions instead of a broken screen.
// ---------------------------------------------------------------------------

// Project: kandy-uni-timetable · Firestore in asia-south1 (Mumbai).
// A Firebase web API key is a public project identifier, not a secret — the
// database is protected by firestore.rules, not by hiding these values.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD4kfCpLZdsZgXlrfcpctzccm1kkev6ncQ',
  authDomain: 'kandy-uni-timetable.firebaseapp.com',
  projectId: 'kandy-uni-timetable',
  storageBucket: 'kandy-uni-timetable.firebasestorage.app',
  messagingSenderId: '642293901579',
  appId: '1:642293901579:web:14a77dc72cdf3ccdc2da0e'
};

export const ADMIN_OPTIONS = {
  // Sign-in uses a username, not an email. The username is turned into
  // "<username>@<USERNAME_DOMAIN>" for Firebase Authentication, so an account
  // created as "lakshan" signs in to lakshan@kandyuni.local behind the scenes.
  // Anyone who prefers real email addresses can type the full address instead.
  USERNAME_DOMAIN: 'kandyuni.local',

  // Shown under every admin page title and on the TV display preview.
  CAMPUS_NAME: 'City Campus',

  // The very first account. When the users collection is still empty, this
  // username may create itself an Administrator account from the sign-in page.
  // Clear it (set to '') once your real administrator account exists.
  BOOTSTRAP_USERNAME: 'admin',

  // Logo uploads use Firebase Storage. Set to false to paste a logo URL instead.
  USE_STORAGE: true,

  // Firestore collection / document names. Change only if they clash.
  COLLECTIONS: {
    timetable: 'timetable',
    exams: 'exams',
    videos: 'videos',
    users: 'users',
    settings: 'settings'
  },

  // Where the TV display takes its timetable from once Firebase is connected.
  // 'firebase' = the Timetable page below. 'excel' = ./data/timetable.xlsx.
  // The Display Settings page can switch this at any time.
  DEFAULT_DATA_SOURCE: 'firebase'
};

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.0.2';

export function isFirebaseConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}

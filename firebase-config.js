/* ============================================================
   Firebase config — 355 Lexington Avenue
   ============================================================
   EMPTY ON PURPOSE. With no values here the tracker runs in
   LOCAL mode: everything works, state is saved in the browser,
   no login and no multi-user sync.

   ⚠️  NEVER paste another building's config here. This file
   originally arrived as a copy of CP2's LIVE config, which made
   this page read and write Cooper Park 2's production database
   (its units appeared here, and these railing rows were pushed
   into CP2). One Firebase project per building, always.

   To go live: Firebase Console → new project → Project settings
   → General → Your apps → Web app, and paste those values below.
   Then publish firebase-database-rules.json and create accounts
   for whoever edits.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbPeHv8DrY4-b4wE1uO6LsmGTRN73qhdY",
  authDomain: "lexington-avenue-93a52.firebaseapp.com",
  databaseURL: "https://lexington-avenue-93a52-default-rtdb.firebaseio.com",
  projectId: "lexington-avenue-93a52",
  storageBucket: "lexington-avenue-93a52.firebasestorage.app",
  messagingSenderId: "914079881078",
  appId: "1:914079881078:web:5c116715992804f053cc57"
};

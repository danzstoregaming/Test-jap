// firebase-init.js — init Firebase (Firestore) for DanzStoreGaming
// NOTE: apiKey in web config is normal (public). Security is controlled by Firestore Rules.

(function () {
  const firebaseConfig = (window.DSG_FIREBASE_CONFIG && typeof window.DSG_FIREBASE_CONFIG === "object")
  ? window.DSG_FIREBASE_CONFIG
  : {
      apiKey: "AIzaSyCneV5hbQbknKzCkY5R5l_S_gpG9g-MqkY",
      authDomain: "danzstoregaming-order.firebaseapp.com",
      projectId: "danzstoregaming-order",
      storageBucket: "danzstoregaming-order.firebasestorage.app",
      messagingSenderId: "242913566087",
      appId: "1:242913566087:web:648a27a304eb0d0623c722"
    };

  // Firebase compat SDKs must be loaded before this file.
  if (!window.firebase || !firebase.initializeApp) {
    console.warn("[DSG Firebase] Firebase SDK not loaded. Firestore disabled.");
    window.DSGFirebase = { enabled: false, db: null, serverTimestamp: null };
    return;
  }

  try {
    // prevent 'already exists' if reloaded
    const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore(app);

    window.DSGFirebase = {
      enabled: true,
      app,
      db,
      serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp()
    };

    console.log("[DSG Firebase] Firestore enabled.");
  } catch (e) {
    console.warn("[DSG Firebase] Init failed. Firestore disabled.", e);
    window.DSGFirebase = { enabled: false, db: null, serverTimestamp: null };
  }
})();

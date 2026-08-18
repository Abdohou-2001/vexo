"use strict";

/**
 * VEXO HVAC - js/firebase.js
 * Central Firebase initialization - production ready
 * No auth logic, no CRUD, no admin logic here
 * Works on GitHub Pages with browser ES Modules (no bundler)
 */

// Firebase Modular SDK - CDN ESM (works without npm)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";

// Your web app's Firebase configuration - EXACT from provided info
const firebaseConfig = {
  apiKey: "AIzaSyDj-pkCXa7-Gak9IY2hgSix8NFn_fypM1I",
  authDomain: "vexo-a6f0e.firebaseapp.com",
  projectId: "vexo-a6f0e",
  storageBucket: "vexo-a6f0e.firebasestorage.app",
  messagingSenderId: "9184530391",
  appId: "1:9184530391:web:7e3230e78ecc7ee5628592",
  measurementId: "G-8DWF1MJS8Q"
};

// Validate config presence - fail clearly if incomplete
const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    throw new Error(`[firebase.js] Missing required Firebase config key: ${key}`);
  }
}

// Initialize Firebase App - single instance
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  console.error("[firebase.js] initializeApp failed:", err);
  throw err;
}

// Initialize Auth - for auth.js
let auth;
try {
  auth = getAuth(app);
} catch (err) {
  console.error("[firebase.js] getAuth failed:", err);
  throw err;
}

// Initialize Firestore - for future data layer
let db;
try {
  db = getFirestore(app);
} catch (err) {
  console.error("[firebase.js] getFirestore failed:", err);
  throw err;
}

// Initialize Analytics - safely, only if supported
let analytics = null;
try {
  const supported = await isAnalyticsSupported();
  if (supported) {
    analytics = getAnalytics(app);
  }
} catch (err) {
  // Analytics failure must NOT block Auth or Firestore
  console.warn("[firebase.js] Analytics not initialized (non-critical):", err);
}

// Export for other modules
export { app, auth, db, analytics, firebaseConfig };

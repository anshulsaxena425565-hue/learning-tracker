import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase Web configuration is intentionally client-side/public.
// Prefer Vercel/Vite environment variables when present, but keep the
// production project config as a safe fallback so a missing deployment
// environment variable cannot prevent the entire app from booting.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCSS1oYG13sDBvk4YXjhExN-EbTklxUl0A',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'learningbeyond-aa6ea.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'learningbeyond-aa6ea',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'learningbeyond-aa6ea.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1047787625136',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1047787625136:web:561282dfe5e561284bb975',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-6FP82L6KM8',
}

const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
const missing = required.filter((key) => !firebaseConfig[key])

if (missing.length) {
  throw new Error('Firebase is not configured. Missing: ' + missing.join(', '))
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)

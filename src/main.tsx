import React from 'react';
import ReactDOM from 'react-dom/client';
import { SetupPage } from './pages/SetupPage';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const firebaseKeys = [
  import.meta.env.VITE_FIREBASE_API_KEY,
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  import.meta.env.VITE_FIREBASE_APP_ID,
];

if (firebaseKeys.every((value) => typeof value === 'string' && value.length > 0)) {
  void import('./App').then(({ App }) => {
    root.render(<React.StrictMode><App /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><SetupPage /></React.StrictMode>);
}

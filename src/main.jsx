import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { applyTheme, readTheme } from './lib/theme.js';

// Before the first render, so nobody sees a white flash on the way to dark.
applyTheme(readTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);

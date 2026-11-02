import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import { App } from './App';
import './styles/theme.css';

// PWA Service Worker Registration & Reliable Update Detection
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Check if there is already an updated worker waiting
      if (registration.waiting) {
        window.dispatchEvent(new CustomEvent('pwa-update-available'));
      }

      // Listen for updates found while browsing
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version installed while existing version is controlling the page
            window.dispatchEvent(new CustomEvent('pwa-update-available'));
          }
        });
      });
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });

    // Handle controller change (when new worker takes control)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        // Optionally refresh or let user click update
      }
    });
  });
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
}

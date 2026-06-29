import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-reload na novou verzi: service worker je autoUpdate (skipWaiting +
// clientsClaim), takže nová verze převezme kontrolu sama. Jakmile převezme,
// stránku tiše obnovíme — uživatel nemusí ručně čistit cache.
if ("serviceWorker" in navigator) {
  let reloaded = false;
  // Na úplně první návštěvě ještě není controller; ten první „claim"
  // nepovažujeme za aktualizaci, takže nereloadujeme.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

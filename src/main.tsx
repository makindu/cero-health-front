
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { RouterProvider } from 'react-router/dom';

import { AppProviders } from '@/app/AppProviders';
import { initI18n } from '@/core/i18n';
import { rememberChatLink } from '@/modules/messaging/chat-push';
import { initDesktopWindowShortcuts } from '@/desktop/window-shortcuts';
import { revealDesktopWindow } from '@/desktop/window-startup';
import { router } from '@/routes';

import './styles/index.css';

// Une notification de la messagerie peut ouvrir l'application sur "#chat=ID".
// On retient le lien avant la connexion.
rememberChatLink();

// Raccourcis clavier disponibles uniquement dans Tauri.
initDesktopWindowShortcuts();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Élément #root introuvable.');
}

const root = createRoot(container);

void initI18n().then(() => {
  // Effectuer le premier rendu React avant d'afficher la fenêtre.
  flushSync(() => {
    root.render(
      <StrictMode>
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>
      </StrictMode>,
    );
  });

  // Afficher la fenêtre principale uniquement dans la version Desktop.
  requestAnimationFrame(() => {
    void revealDesktopWindow();
  });
});

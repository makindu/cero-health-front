import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/AppProviders';
import { initI18n } from '@/core/i18n';
import { rememberChatLink } from '@/modules/messaging/chat-push';
import { router } from '@/routes';
import './styles/index.css';

// Une notification de la messagerie peut ouvrir l'application sur « #chat=ID » : on retient le lien avant la connexion.
rememberChatLink();

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable.');

void initI18n().then(() => {
  createRoot(container).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
});

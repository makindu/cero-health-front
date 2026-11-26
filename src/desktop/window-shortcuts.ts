
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

let initialized = false;

export function initDesktopWindowShortcuts(): void {
  if (!isTauri() || initialized) return;

  initialized = true;

  const appWindow = getCurrentWindow();

  // Réception des demandes provenant du menu natif Tauri.
  void listen('cero://open-help', () => {
    window.location.assign('/help');
  }).catch((error: unknown) => {
    console.error(
      '[CERO HEALTH] Erreur écoute menu Aide:',
      error,
    );
  });

  window.addEventListener('keydown', async (event: KeyboardEvent) => {
    // F1 : ouvrir le Centre d'aide.
    if (event.key === 'F1') {
      event.preventDefault();
      window.location.assign('/help');
      return;
    }

    // F11 : activer ou quitter le plein écran.
    if (event.key === 'F11') {
      event.preventDefault();

      const fullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!fullscreen);
      return;
    }

    // Échap : quitter le plein écran.
    if (event.key === 'Escape') {
      const fullscreen = await appWindow.isFullscreen();

      if (fullscreen) {
        event.preventDefault();
        await appWindow.setFullscreen(false);
      }

      return;
    }

    // Ctrl + M : minimiser.
    if (
      event.ctrlKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'm'
    ) {
      event.preventDefault();
      await appWindow.minimize();
      return;
    }

    // Ctrl + Shift + F : maximiser / restaurer.
    if (
      event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === 'f'
    ) {
      event.preventDefault();
      await appWindow.toggleMaximize();
    }
  });
}

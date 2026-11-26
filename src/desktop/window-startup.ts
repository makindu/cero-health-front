
import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

export async function revealDesktopWindow(): Promise<void> {
  if (!isTauri()) return;

  const mainWindow = getCurrentWindow();

  try {
    const splashWindow =
      await WebviewWindow.getByLabel('splashscreen');

    // Afficher l'application après son premier rendu React.
    await mainWindow.show();

    // Fermer ensuite le Splash Screen.
    if (splashWindow) {
      await splashWindow.close();
    }
  } catch (error) {
    console.error(
      '[CERO HEALTH] Erreur pendant la fermeture du Splash Screen:',
      error,
    );

    // Ne jamais laisser l'application principale invisible.
    try {
      await mainWindow.show();
    } catch (showError) {
      console.error(
        "[CERO HEALTH] Impossible d'afficher la fenêtre principale:",
        showError,
      );
    }
  }
}

import { getCurrentWindow } from '@tauri-apps/api/window';

export async function configureTauriWindow(): Promise<void> {
  try {
    const appWindow = getCurrentWindow();

    await appWindow.setIcon('/icons/128x128.png');

    console.log('CERO HEALTH: icône de fenêtre configurée.');
  } catch (error) {
    console.error('Erreur de configuration de l’icône Tauri:', error);
  }
}
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Remplace l'attente sans fin quand la connexion est coupée : on dit ce qui se passe au lieu de laisser clignoter des blocs gris.
 * Aucune action à faire : les données se chargent d'elles-mêmes au retour de la connexion (le bandeau en haut donne la cause précise).
 */
export function OfflineState() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
        <WifiOff aria-hidden className="size-6" />
      </span>
      <h3 className="text-base font-semibold text-foreground">{t('connection.unavailable')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{t('connection.unavailableText')}</p>
    </div>
  );
}

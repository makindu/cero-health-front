import { CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState } from '@/components/feedback/empty-state';
import { Spinner } from '@/components/feedback/spinner';
import { Button, buttonVariants } from '@/components/ui/button';

const RELOAD_KEY = 'cero-health:chunk-reload-at';
const RELOAD_WINDOW_MS = 15_000;

/** Fichier de page introuvable : serveur de développement relancé, ou nouvelle version publiée pendant que l'onglet était ouvert. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /dynamically imported module|importing a module script failed|error loading dynamically imported|Unable to preload CSS/i.test(message);
}

/** Un seul rechargement automatique par fenêtre de 15 s (évite toute boucle si le fichier reste introuvable). */
function shouldAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false; // stockage indisponible : pas de rechargement automatique, le bouton reste proposé
  }
}

/**
 * Page d'erreur de route (errorElement) : remplace l'écran « Unexpected Application Error ».
 *  - fichier de page introuvable → rechargement automatique une fois, sinon bouton « Recharger la page » ;
 *  - autre erreur → message clair, « Recharger », « Retour au tableau de bord » ; détail technique en développement seulement.
 */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const chunk = isChunkLoadError(error);
  const autoReload = chunk && shouldAutoReload();

  useEffect(() => {
    if (autoReload) window.location.reload();
  }, [autoReload]);

  useEffect(() => {
    if (import.meta.env.DEV) console.error('[route-error]', error);
  }, [error]);

  if (autoReload) {
    return (
      <div className="flex justify-center px-4 py-10">
        <Spinner label={t('routeError.reloading')} />
      </div>
    );
  }

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const key = chunk ? 'chunk' : status === 404 ? 'notFound' : 'generic';
  const detail = import.meta.env.DEV && !chunk && error instanceof Error ? error.message : undefined;

  return (
    <div role="alert">
      <EmptyState
        icon={chunk ? RefreshCw : CircleAlert}
        title={t(`routeError.${key}.title`)}
        description={t(`routeError.${key}.description`)}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('routeError.reload')}
            </Button>
            <Link to="/" className={buttonVariants('outline')}>
              {t('notFound.backHome')}
            </Link>
          </div>
        }
      />
      {detail && <p className="mx-auto max-w-lg px-4 text-center font-mono text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default RouteError;

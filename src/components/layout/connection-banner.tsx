import { CloudOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/feedback/toast';
import { healthClient, idCoreClient, uzishaClient } from '@/core/api';
import { getStatus, onReconnect, useConnectionStatus, watchBrowserConnection, type ServerName } from '@/core/connectivity/connectivity';

const CLIENTS = { health: healthClient, 'id-core': idCoreClient, uzisha: uzishaClient } as const;
const PROBE_MS = 10_000;

/** Tant qu'un serveur est en panne, on le ressonde : sans cela, le bandeau resterait jusqu'à la prochaine action de l'utilisateur. */
function probeDownServers(): void {
  const { browserOffline, down } = getStatus();
  if (browserOffline) return; // le retour du réseau est annoncé par le navigateur
  for (const name of down) {
    // N'importe quelle réponse (même 404) prouve que le serveur est de retour : l'intercepteur le note. Aucune donnée n'est lue.
    void CLIENTS[name].get('/', { skipSessionEvents: true } as never).catch(() => undefined);
  }
}

/**
 * Bandeau « connexion perdue » : dit précisément ce qui ne répond pas (ordinateur sans réseau, ou quel serveur).
 * Ce qui est saisi reste sur l'appareil (brouillons) ; au retour, un message le confirme.
 */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const status = useConnectionStatus();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => watchBrowserConnection(), []);
  useEffect(
    () =>
      onReconnect(() =>
        toastRef.current({ tone: 'success', title: tRef.current('connection.backTitle'), description: tRef.current('connection.backText') }),
      ),
    [],
  );
  const hasDown = status.down.length > 0;
  useEffect(() => {
    if (!hasDown) return;
    const id = setInterval(probeDownServers, PROBE_MS);
    return () => clearInterval(id);
  }, [hasDown]);

  if (!status.browserOffline && !hasDown) return null;
  const causes: string[] = status.browserOffline
    ? [t('connection.browser')]
    : status.down.map((name: ServerName) => t(`connection.server.${name === 'id-core' ? 'idCore' : name}`));
  return (
    <div
      role="alert"
      className="no-print flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-xs font-medium text-foreground"
    >
      <CloudOff aria-hidden className="size-3.5 shrink-0" />
      <span>
        <strong>{causes.join(' ')}</strong> {t('connection.lostText')}
      </span>
    </div>
  );
}

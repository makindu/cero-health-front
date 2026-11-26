
import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
    check,
    type Update,
} from '@tauri-apps/plugin-updater';
import {
    CheckCircle2,
    Download,
    LoaderCircle,
    RefreshCw,
    X,
} from 'lucide-react';

type UpdateState =
    | 'available'
    | 'downloading'
    | 'installing'
    | 'error';

interface UpdateNotice {
    update: Update;
    version: string;
    notes: string;
    state: UpdateState;
    progress: number | null;
}

let startupCheck: Promise<Update | null> | null = null;

function checkForUpdate(): Promise<Update | null> {
    if (!startupCheck) {
        startupCheck = check({ timeout: 15000 }).catch((error) => {
            startupCheck = null;
            throw error;
        });
    }

    return startupCheck;
}

export function DesktopUpdateManager() {
    const [notice, setNotice] = useState<UpdateNotice | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isTauri()) return;

        let active = true;

        void checkForUpdate()
            .then((update) => {
                if (!active || !update) return;

                setNotice({
                    update,
                    version: update.version,
                    notes: update.body ?? 'Améliorations et corrections disponibles.',
                    state: 'available',
                    progress: null,
                });
            })
            .catch((error: unknown) => {
                console.warn(
                    '[CERO HEALTH] Vérification des mises à jour impossible:',
                    error,
                );
            });

        return () => {
            active = false;
        };
    }, []);

    async function dismiss(): Promise<void> {
        if (!notice || notice.state === 'downloading' || notice.state === 'installing') {
            return;
        }

        const update = notice.update;
        setNotice(null);
        await update.close();
    }

    async function installUpdate(): Promise<void> {
        if (!notice || notice.state !== 'available') return;

        const update = notice.update;

        setNotice((current) =>
            current ? { ...current, state: 'downloading', progress: 0 } : null,
        );

        try {
            let downloaded = 0;
            let contentLength = 0;

            await update.download((event) => {
                if (event.event === 'Started') {
                    contentLength = event.data.contentLength ?? 0;
                }

                if (event.event === 'Progress') {
                    downloaded += event.data.chunkLength;

                    const progress =
                        contentLength > 0
                            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                            : null;

                    setNotice((current) =>
                        current
                            ? { ...current, progress }
                            : null,
                    );
                }

                if (event.event === 'Finished') {
                    setNotice((current) =>
                        current ? { ...current, progress: 100 } : null,
                    );
                }
            });

            setNotice((current) =>
                current ? { ...current, state: 'installing' } : null,
            );

            await update.install();
        } catch (error) {
            console.error('[CERO HEALTH] Installation de la mise à jour échouée:', error);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Une erreur est survenue pendant la mise à jour.',
            );

            setNotice((current) =>
                current ? { ...current, state: 'error' } : null,
            );
        }
    }

    if (!isTauri() || !notice) return null;

    return (
        <aside
            role="status"
            aria-live="polite"
            className="fixed right-4 top-4 z-[100] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-surface shadow-popover"
        >
            <div className="flex items-start gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {notice.state === 'downloading' ? (
                        <Download className="size-5" />
                    ) : notice.state === 'installing' ? (
                        <LoaderCircle className="size-5 animate-spin" />
                    ) : notice.state === 'error' ? (
                        <RefreshCw className="size-5" />
                    ) : (
                        <CheckCircle2 className="size-5" />
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                        {notice.state === 'available'
                            ? 'Mise à jour disponible'
                            : notice.state === 'downloading'
                                ? 'Téléchargement en cours'
                                : notice.state === 'installing'
                                    ? 'Installation en cours'
                                    : 'Échec de la mise à jour'}
                    </p>

                    <p className="text-xs text-muted-foreground">
                        CERO HEALTH · Version {notice.version}
                    </p>

                    {notice.state === 'available' && (
                        <p className="pt-1 text-sm text-muted-foreground">
                            {notice.notes}
                        </p>
                    )}

                    {notice.state === 'downloading' && (
                        <div className="space-y-1 pt-2">
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${notice.progress ?? 5}%` }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {notice.progress === null
                                    ? 'Téléchargement...'
                                    : `${notice.progress}%`}
                            </p>
                        </div>
                    )}

                    {notice.state === 'installing' && (
                        <p className="text-sm text-muted-foreground">
                            Préparation de l'installation. Ne fermez pas l'application.
                        </p>
                    )}

                    {notice.state === 'error' && (
                        <p className="text-xs text-danger">
                            {errorMessage}
                        </p>
                    )}

                    {notice.state === 'available' && (
                        <div className="flex items-center gap-2 pt-3">
                            <button
                                type="button"
                                onClick={() => void installUpdate()}
                                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                            >
                                <Download className="size-4" />
                                Télécharger
                            </button>

                            <button
                                type="button"
                                onClick={() => void dismiss()}
                                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-muted"
                            >
                                Plus tard
                            </button>
                        </div>
                    )}

                    {notice.state === 'error' && (
                        <button
                            type="button"
                            onClick={() => void dismiss()}
                            className="mt-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-muted"
                        >
                            Fermer
                        </button>
                    )}
                </div>

                {(notice.state === 'available' || notice.state === 'error') && (
                    <button
                        type="button"
                        onClick={() => void dismiss()}
                        aria-label="Fermer la notification"
                        className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>
        </aside>
    );
}

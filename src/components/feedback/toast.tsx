import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';

export interface ToastInput {
  tone: StatusTone;
  title: string;
  description?: string;
}
interface ToastItem extends ToastInput {
  id: number;
}

const DURATION_MS = 6000;
const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

let nextId = 1;

/** Notifications temporaires. Ne jamais y mettre de donnée médicale identifiante. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((item) => item.id !== id)),
    [],
  );
  const push = useCallback((toast: ToastInput) => {
    setToasts((list) => [...list.slice(-3), { ...toast, id: nextId++ }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="region"
        aria-label={t('toast.region')}
        className="no-print pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-96"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const urgent = toast.tone === 'danger' || toast.tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-card border border-border bg-surface p-3 shadow-popover"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <StatusBadge tone={toast.tone}>{toast.title}</StatusBadge>
        {toast.description && <p className="text-sm text-muted-foreground">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label={t('toast.dismiss')}
        onClick={() => onDismiss(toast.id)}
        className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast doit être utilisé dans <ToastProvider>.');
  return useMemo(() => push, [push]);
}

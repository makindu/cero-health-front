import { env } from '@/core/config/env';
import type { DocLogo } from '../_shared/export/document-model';
import { readJpeg } from '../_shared/export/jpeg';

/** Au-delà, ce n'est plus un logo normalisé : on l'ignore plutôt que d'alourdir le document. */
export const MAX_LOGO_BYTES = 400_000;
const TIMEOUT_MS = 6_000;

/**
 * Logo de l'établissement actif, lu à l'adresse publique de CERO ID (le Core le normalise en JPEG).
 * Jamais bloquant : pas de logo, serveur injoignable, réponse trop lourde ou illisible → `null`, le document s'imprime sans.
 */
export async function fetchEnterpriseLogo(enterpriseId: number | string | null | undefined, base: string | null = env.api.idCore ?? null): Promise<DocLogo | null> {
  const id = Number(enterpriseId);
  if (!Number.isInteger(id) || id <= 0 || !base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/v1/enterprise-logos/${id}`, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
    const info = readJpeg(bytes);
    return info ? { bytes, ...info } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { apiInsurance } from './insurance-api';
import type { StatementKind } from './insurance-api';

/**
 * Ouvre le relevé PDF d'un organisme. La fenêtre est ouverte AVANT la requête : sinon le navigateur bloque l'ouverture
 * (fenêtre non demandée par un clic). Si elle est bloquée, le fichier est téléchargé.
 */
export async function openStatementPdf(orgId: string, from: string, to: string, kind: StatementKind = 'synthetic'): Promise<void> {
  const popup = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await apiInsurance.statementPdf(orgId, from, to, kind));
    if (popup) {
      popup.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = `releve-creances${kind === 'detailed' ? '-detaille' : ''}-${from}-${to}.pdf`;
      a.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

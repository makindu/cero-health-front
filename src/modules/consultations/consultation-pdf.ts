import { healthClient } from '@/core/api';

/**
 * Fiche de consultation imprimée par le serveur (PDF avec en-tête de l'établissement, médecin, signature).
 * La fenêtre est ouverte AVANT la requête, sinon le navigateur bloque l'ouverture (fenêtre non demandée par un clic).
 */
export async function openConsultationPdf(consultationId: string): Promise<void> {
  const popup = window.open('', '_blank');
  try {
    const res = await healthClient.raw.get<Blob>(`/consultations/${encodeURIComponent(consultationId)}/pdf`, { responseType: 'blob', headers: { Accept: 'application/pdf' } });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (popup) {
      popup.location.href = url;
    } else {
      // Fenêtre bloquée : on télécharge le fichier.
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiche-consultation-${consultationId}.pdf`;
      a.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}

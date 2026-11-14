/** Déclenche le téléchargement d'un fichier généré dans le navigateur (aucune donnée n'est envoyée ailleurs). */
export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF_MIME = 'application/pdf';

/** Nom de fichier sûr : lettres, chiffres, tirets. */
export function safeFilename(base: string, extension: string, date: string): string {
  const clean = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${clean || 'export'}-${date}.${extension}`;
}

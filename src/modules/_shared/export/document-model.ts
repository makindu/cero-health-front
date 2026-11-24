/** Contenu d'un document, indépendant du format de sortie (Word modifiable, PDF). */
export type DocBlock =
  | { kind: 'title'; text: string }
  | { kind: 'meta'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: readonly string[] }
  | { kind: 'note'; text: string }
  /** Fiche d'identité : paires libellé / valeur rangées sur deux colonnes. */
  | { kind: 'facts'; rows: readonly { label: string; value: string }[] }
  /** Chiffres clés : une rangée de cases (4 au plus pour rester lisible). */
  | { kind: 'stats'; items: readonly { value: string; label: string }[] }
  /** Tableau : `widths` donne le poids relatif de chaque colonne ; `align` « right » pour les nombres. */
  | { kind: 'table'; head: readonly string[]; rows: readonly (readonly string[])[]; widths?: readonly number[]; align?: readonly ('left' | 'right')[] }
  /** Espaces de signature : un trait par libellé (« Le médecin », « Cachet »…). */
  | { kind: 'signature'; labels: readonly string[] }
  /** Lignes vides à remplir à la main (PDF imprimé) ou dans Word. */
  | { kind: 'writeIn'; lines: number };

/** Logo : image JPEG telle quelle (PDF et Word l'intègrent sans la décoder), avec ses dimensions. */
export interface DocLogo { bytes: Uint8Array; width: number; height: number; components: 1 | 3 }

/** En-tête de l'établissement : nom puis lignes de coordonnées (adresse, contacts, identifiants légaux), logo facultatif à droite. */
export interface DocLetterhead { name: string; lines: readonly string[]; logo?: DocLogo | undefined }

export interface DocMeta {
  title: string;
  footer: string;
  letterhead?: DocLetterhead | undefined;
  /** Mention de confidentialité en pied de chaque page. */
  confidential?: string | undefined;
  /** « Page » : libellé du numéro de page. */
  pageLabel?: string | undefined;
}

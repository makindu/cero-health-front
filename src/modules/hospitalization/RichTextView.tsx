import { useMemo } from 'react';
import { renderDocToHtml } from '../consultations/richtext/doc';
import { toDoc } from './visit-rules';

/**
 * Lecture seule d'un texte enrichi. Le HTML est produit par `renderDocToHtml` à partir du document JSON filtré
 * (liste blanche de nœuds, tout texte échappé) : aucun HTML saisi par un utilisateur n'est jamais injecté tel quel.
 * Accepte aussi un ancien texte simple.
 */
export function RichTextView({ value }: { value: unknown }) {
  const html = useMemo(() => renderDocToHtml(toDoc(value)), [value]);
  // eslint-disable-next-line react/no-danger -- HTML généré et échappé par renderDocToHtml (voir ci-dessus)
  return <div className="rte-content text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
}

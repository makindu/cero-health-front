/**
 * Temps réel : correspondance entre les signaux du serveur (nom de table sans « health_ ») et les listes à relire.
 * Un signal ne contient jamais de donnée clinique : on relit simplement les écrans concernés, droits appliqués par l'API.
 * Le dossier clinique en cours de saisie (consultation-records) n'est volontairement jamais relu automatiquement.
 */
export interface LiveEvent {
  id: number;
  entity: string;
  entity_id: number;
  op: 'created' | 'updated' | 'deleted';
  patient_id: number | null;
  ref_type: string | null;
  ref_id: number | null;
  actor: number | null;
  at: string;
}

const FLOW = ['appointments', 'triage', 'dashboard', 'patientFlow'] as const;

export const ENTITY_QUERIES: Readonly<Record<string, readonly string[]>> = {
  patients: ['patients', ...FLOW],
  patient_categories: ['patients'],
  appointments: FLOW,
  appointment_events: ['appointments'],
  triage_entries: FLOW,
  vital_signs: ['triage-vitals', 'triage'],
  consultations: ['consultations', 'dashboard', 'hospital'],
  consultation_addenda: ['consultations'],
  diagnoses: ['consultations'],
  prescriptions: ['prescriptions', 'pharmacy', 'dashboard'],
  prescription_items: ['prescriptions', 'pharmacy'],
  // Médicament écrit par un confrère : les suggestions de saisie se mettent à jour.
  drug_names: ['prescriptions'],
  admissions: ['hospital', 'patientFlow', 'dashboard'],
  beds: ['beds', 'hospital'],
  // Chambre créée, modifiée ou supprimée par le gestionnaire : le plan des lits et la configuration se mettent à jour.
  rooms: ['hospital'],
  stays: ['hospital'],
  // Pharmacie : une préparation, une remise ou un paiement met à jour la file, les dispensations et l'ordonnance.
  messages: ['messaging'],
  conversations: ['messaging'],
  conversation_members: ['messaging'],
  dispensations: ['pharmacy', 'prescriptions', 'dashboard'],
  dispensation_lines: ['pharmacy'],
  billing_links: ['pharmacy', 'hospital'],
  billing_payments: ['pharmacy', 'hospital'],
  lab_orders: ['laboratory', 'dashboard'],
  // Examen ajouté par un confrère : la liste d'examens proposée se met à jour sans recharger la page.
  lab_tests: ['laboratory'],
};

/** Noms de requêtes (clé « facility, <id>, <nom> ») à relire pour ces signaux, sans doublon. */
export function queriesToRefresh(events: readonly Pick<LiveEvent, 'entity'>[]): string[] {
  const names = new Set<string>();
  for (const e of events) for (const n of ENTITY_QUERIES[e.entity] ?? []) names.add(n);
  return [...names];
}

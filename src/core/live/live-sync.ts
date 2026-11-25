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
  // Courrier patient : la boîte d'envoi de la fiche se relit quand un message est mis en file, envoyé ou annulé.
  patient_mails: ['patient-mail'],
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
  drug_names: ['prescriptions', 'review'],
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
  // Facturation : liste, fiche et paiements se relisent à chaque signal (un encaissement vient souvent d'un autre poste).
  billing_links: ['pharmacy', 'hospital', 'billing'],
  billing_payments: ['pharmacy', 'hospital', 'billing'],
  billing_settings: ['billing'],
  // Assurance : organismes, créances et règlements se relisent ; une créance suit la facture du patient (écran de facturation).
  insurance_organizations: ['insurance'],
  insurance_dues: ['insurance', 'billing'],
  insurance_due_entries: ['insurance', 'billing'],
  insurance_settlements: ['insurance'],
  // Boîte d'envoi des courriers de l'établissement : l'état d'un relevé envoyé en arrière-plan se met à jour tout seul.
  mail_outbox: ['insurance'],
  insurance_contracts: ['insurance'],
  insurance_rules: ['insurance'],
  insurance_subscriptions: ['insurance'],
  insurance_coverages: ['insurance'],
  insurance_authorizations: ['insurance'],
  // Dépenses : liste, totaux, caisse du jour (« expenses ») et rapports se relisent quand une dépense est saisie, validée ou annulée.
  expenses: ['expenses', 'reports'],
  // Services (unités de soin) et leurs types propres à l'établissement : la liste des services, la liste de choix « Type de service » et les listes de référence se relisent.
  care_units: ['services', 'reference'],
  care_unit_types: ['care-unit-types'],
  staff_functions: ['staff-functions', 'staff', 'reference'],
  // Catalogue (médicaments, prestations, prix, unités de vente) importé ou modifié : les listes du catalogue et les produits proposés à la préparation se relisent.
  catalog_items: ['pharmacy', 'service-catalog', 'lab-catalog', 'review'],
  lab_orders: ['laboratory', 'dashboard'],
  // Examen ajouté par un confrère : la liste d'examens proposée se met à jour sans recharger la page.
  lab_tests: ['laboratory', 'review', 'lab-catalog'],
  // Notification adressée à la personne connectée (le serveur ne la signale qu'à son destinataire) : cloche et compteur se relisent.
  notifications: ['notifications'],
  // Dossier médical ouvert, archivé, verrouillé ou lu : la liste, la fiche et l'historique se relisent.
  medical_records: ['medical-records'],
  medical_record_events: ['medical-records'],
};

/**
 * Entités dont la CRÉATION est annoncée par un bandeau (« nouvel article ajouté ») au lieu de relire les listes : un catalogue peut compter des
 * milliers de lignes, le relire à chaque ajout ferait attendre tout le monde. La liste n'est relue que si la personne clique sur « Voir ».
 */
export const ARRIVAL_ENTITIES: readonly string[] = ['catalog_items', 'lab_tests'];

/** Listes lourdes qu'une simple création ne relit pas (les autres relectures de l'entité restent). */
const ARRIVAL_ONLY_QUERIES: Readonly<Record<string, readonly string[]>> = {
  catalog_items: ['pharmacy', 'service-catalog', 'lab-catalog', 'review'],
  lab_tests: ['lab-catalog'],
};

/** Noms de requêtes (clé « facility, <id>, <nom> ») à relire pour ces signaux, sans doublon. */
export function queriesToRefresh(events: readonly (Pick<LiveEvent, 'entity'> & Partial<Pick<LiveEvent, 'op'>>)[]): string[] {
  const names = new Set<string>();
  for (const e of events) {
    const skip = e.op === 'created' ? ARRIVAL_ONLY_QUERIES[e.entity] ?? [] : [];
    for (const n of ENTITY_QUERIES[e.entity] ?? []) if (!skip.includes(n)) names.add(n);
  }
  return [...names];
}

/** Une modification arrivant juste après la création du même élément (ex. mise à jour du prix) ne relit pas la liste non plus. */
export const RECENT_CREATION_MS = 15_000;

export interface ArrivalGroup {
  entity: string;
  ids: number[];
}

/**
 * Sépare les signaux : `refresh` = ceux qui relisent des écrans ; `arrivals` = créations à annoncer par un bandeau (sans requête).
 * `recent` mémorise les créations récentes (« entité:id » → heure) pour ignorer la modification qui les suit.
 */
export function splitArrivals(events: readonly LiveEvent[], recent: Map<string, number>, now: number): { refresh: LiveEvent[]; arrivals: ArrivalGroup[] } {
  for (const [k, at] of recent) if (now - at > RECENT_CREATION_MS) recent.delete(k);
  const refresh: LiveEvent[] = [];
  const grouped = new Map<string, Set<number>>();
  for (const e of events) {
    const key = `${e.entity}:${e.entity_id}`;
    if (ARRIVAL_ENTITIES.includes(e.entity)) {
      if (e.op === 'created') {
        recent.set(key, now);
        grouped.set(e.entity, (grouped.get(e.entity) ?? new Set<number>()).add(e.entity_id));
      } else if (e.op === 'updated' && recent.has(key)) {
        continue;
      }
    }
    refresh.push(e);
  }
  return { refresh, arrivals: [...grouped].map(([entity, ids]) => ({ entity, ids: [...ids] })) };
}

import { healthClient } from '@/core/api';

/**
 * Lien patient ↔ fiche client UZISHA. Sans fiche client, aucune facture n'est possible.
 * Le serveur cherche les doublons (téléphone ou nom identique) : l'interface propose de lier l'un d'eux ou de créer la fiche.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});

export interface CustomerCandidate { customerId: string; name: string; phone: string; linkedPatientId: string | null }

export function candidateFrom(r: Row): CustomerCandidate {
  return { customerId: text(r.customer_id), name: text(r.name), phone: text(r.phone), linkedPatientId: r.linked_patient_id ? text(r.linked_patient_id) : null };
}

/** Un client déjà lié à un autre patient ne peut pas être choisi. */
export const canLink = (c: CustomerCandidate): boolean => c.linkedPatientId === null;

export const apiCustomer = {
  hasCustomer: async (patientId: string): Promise<boolean> => rec((await healthClient.get<Row>(`/patients/${patientId}`)).data).has_customer === true,

  candidates: async (patientId: string): Promise<CustomerCandidate[]> => {
    const res = await healthClient.get<Row[]>(`/patients/${patientId}/customer/candidates`);
    return (Array.isArray(res.data) ? res.data : []).map((r) => candidateFrom(rec(r)));
  },

  link: async (patientId: string, customerId: string): Promise<void> => {
    await healthClient.post(`/patients/${patientId}/customer/link`, { customer_id: Number(customerId) });
  },

  /** `confirmNoDuplicate` : l'utilisateur a vu les clients proches et confirme qu'aucun ne correspond. La clé rend l'envoi rejouable. */
  create: async (patientId: string, confirmNoDuplicate: boolean, key: string): Promise<void> => {
    await healthClient.post(`/patients/${patientId}/customer/create`, { confirm_no_duplicate: confirmNoDuplicate }, { headers: { 'Idempotency-Key': key } });
  },
};

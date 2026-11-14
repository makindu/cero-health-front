import { appointmentRepo } from '../appointments/data';
import { triageRepo } from '../nursing/data';
import type { Patient } from './data';
import type { MergePlan } from './local-rules';

/**
 * Fusion de dossiers (mode local) : les rendez-vous et passages au triage des dossiers doublons sont rattachés au dossier conservé.
 * Chargé à la demande (import dynamique) pour éviter une dépendance circulaire entre modules.
 */
export async function repointPatientReferences(plan: MergePlan, keep: Patient): Promise<void> {
  const appointments = appointmentRepo;
  const triage = triageRepo;
  for (const row of await appointments.list()) {
    if (!plan.duplicateIds.includes(row.patientId)) continue;
    await appointments.update(row.id, (a) => ({ ...a, patientId: keep.id, patientName: keep.fullName }), { action: 'merge-repoint' });
  }
  for (const row of await triage.list()) {
    if (!plan.duplicateIds.includes(row.patientId)) continue;
    await triage.update(row.id, (e) => ({ ...e, patientId: keep.id, patientName: keep.fullName }), { action: 'merge-repoint' });
  }
}

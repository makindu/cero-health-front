import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({ localMode: true }));

vi.mock('@/core/config/env', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown> & { env: Record<string, unknown> }>();
  const env = {
    ...original.env,
    get localMode() {
      return mockEnv.localMode;
    },
  };
  return { ...original, env };
});

import { createMemoryDatabase } from '@/core/local/memory-database';
import { setLocalDatabaseForTests } from '@/core/local/open';
import { setLocalUser } from '@/core/local/session';
import { patientService } from '../patients/data';
import { triageService } from '../nursing/data';
import { appointmentService } from './data';

const all = { page: 1, perPage: 500, search: '', filters: {}, sort: null };
const newPatient = { fullName: 'Patient Local Essai', sex: 'M', birthDate: '1985-03-02', phone: '+000 000 9999', service: 'generalMedicine' };

async function createPatient(): Promise<string> {
  await patientService.create(newPatient);
  const found = (await patientService.list({ ...all, search: 'Patient Local Essai' })).rows[0];
  if (!found) throw new Error('patient non créé');
  return found.fileNumber;
}

describe('parcours accueil — mode local (persistant)', () => {
  beforeEach(() => {
    mockEnv.localMode = true;
    setLocalDatabaseForTests(createMemoryDatabase());
    setLocalUser('local-user-receptionist');
  });
  afterEach(() => setLocalDatabaseForTests(null));

  it('crée un patient, attribue un numéro de dossier et refuse un doublon de numéro', async () => {
    const fileNumber = await createPatient();
    expect(fileNumber).toMatch(/^DOS-LOC-\d{4}-0001$/);
    await expect(patientService.create({ ...newPatient, fullName: 'Autre Personne', fileNumber })).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('accueille sans rendez-vous : arrivé immédiatement, dernière visite mise à jour, pas de double arrivée', async () => {
    const fileNumber = await createPatient();
    await appointmentService.create({ patient: fileNumber, reason: 'Fièvre', service: 'generalMedicine', urgency: 'standard', walkIn: 'true' });
    const queue = (await appointmentService.list({ ...all, filters: { status: 'arrived' } })).rows.filter((a) => a.patientName === 'Patient Local Essai');
    expect(queue).toHaveLength(1);
    const patient = (await patientService.list({ ...all, search: fileNumber })).rows[0];
    expect(patient?.lastVisit).not.toBeNull();
    await expect(appointmentService.create({ patient: fileNumber, reason: 'Fièvre', service: 'generalMedicine', urgency: 'standard', walkIn: 'true' })).rejects.toMatchObject({ message: 'patientAlreadyInQueue' });
  });

  it('refuse le service direct pour une urgence, accepte le triage, puis fait avancer la file', async () => {
    const fileNumber = await createPatient();
    await expect(appointmentService.create({ patient: fileNumber, reason: 'Douleur', service: 'emergency', urgency: 'urgent', walkIn: 'true' })).rejects.toMatchObject({ message: 'triageRequired' });
    await triageService.create({ patient: fileNumber, reason: 'Douleur', priority: 'urgent', source: 'walkIn' });
    setLocalUser('local-user-nurse');
    const entry = (await triageService.list({ ...all, search: 'Patient Local Essai' })).rows[0];
    expect(entry?.status).toBe('waiting');
    await triageService.command(entry!.id, 'start-triage');
    await expect(triageService.command(entry!.id, 'discharge')).rejects.toMatchObject({ message: 'invalidTransition' });
    await triageService.command(entry!.id, 'send-to-care');
    expect((await triageService.get(entry!.id)).item.status).toBe('inCare');
  });

  it('applique les permissions dans le service : le caissier ne peut pas enregistrer une arrivée', async () => {
    const fileNumber = await createPatient();
    setLocalUser('local-user-cashier');
    await expect(appointmentService.create({ patient: fileNumber, reason: 'x', service: 'generalMedicine', urgency: 'standard', walkIn: 'true' })).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

import { describe, expect, it } from 'vitest';
import type { Patient } from './data';
import { findDuplicateGroups, findDuplicatesOf, findFileNumberIssues, isValidFileNumber, normalizeFileNumber, normalizePhone } from './duplicates';

const patient = (id: string, phone: string, fileNumber: string): Patient => ({
  id,
  fileNumber,
  fullName: `Patient ${id}`,
  sex: 'F',
  birthDate: '1990-01-01',
  phone,
  address: '',
  service: 'generalMedicine',
  status: 'active',
  insurer: '',
  emergencyContact: '',
  registeredAt: '2025-01-01',
  lastVisit: null,
});

describe('normalisation', () => {
  it('compare les téléphones sur les chiffres seulement', () => {
    expect(normalizePhone('+243 81 234-56 78')).toBe('243812345678');
    expect(normalizePhone('12 34')).toBe(''); // trop court pour comparer
  });
  it('compare les numéros de dossier sans espaces ni casse', () => {
    expect(normalizeFileNumber(' dos 0001 ')).toBe('DOS0001');
    expect(normalizeFileNumber('DOS-0001')).toBe(normalizeFileNumber('dos0001'));
  });
  it('contrôle le format du numéro de dossier', () => {
    expect(isValidFileNumber('DOS-DEMO-0001')).toBe(true);
    expect(isValidFileNumber('12/2024-7')).toBe(true);
    expect(isValidFileNumber('ab')).toBe(false);
    expect(isValidFileNumber('-DOS1')).toBe(false);
    expect(isValidFileNumber('DOS 1 !')).toBe(false);
  });
  it('signale les numéros de dossier absents ou hors format', () => {
    const issues = findFileNumberIssues([patient('1', '', ''), patient('2', '', 'x!'), patient('3', '', 'DOS-3')]);
    expect(issues.map((i) => `${i.patient.id}:${i.issue}`)).toEqual(['1:missing', '2:format']);
  });
});

describe('détection des doublons', () => {
  const list = [
    patient('1', '+000 000 0001', 'DOS-1'),
    patient('2', '000-000-0001', 'DOS-2'),
    patient('3', '+000 000 0003', 'dos-1'),
    patient('4', '', ''),
    patient('5', '', ''),
  ];

  it('groupe par téléphone et par numéro de dossier', () => {
    const groups = findDuplicateGroups(list);
    const byReason = (r: string) => groups.filter((g) => g.reason === r);
    expect(byReason('phone')).toHaveLength(1);
    expect(byReason('phone')[0]?.patients.map((p) => p.id)).toEqual(['1', '2']);
    expect(byReason('fileNumber')[0]?.patients.map((p) => p.id)).toEqual(['1', '3']);
  });
  it('ne regroupe pas les valeurs vides', () => {
    expect(findDuplicateGroups([patient('4', '', ''), patient('5', '', '')])).toHaveLength(0);
  });
  it('trouve les homonymes d’une saisie en excluant le dossier lui-même', () => {
    const found = findDuplicatesOf({ id: '1', phone: '+000 000 0001', fileNumber: 'DOS-1' }, list);
    expect(found.map((f) => `${f.reason}:${f.patient.id}`).sort()).toEqual(['fileNumber:3', 'phone:2']);
    expect(findDuplicatesOf({ phone: '+999 111 2222', fileNumber: 'NEW-9' }, list)).toHaveLength(0);
  });
});

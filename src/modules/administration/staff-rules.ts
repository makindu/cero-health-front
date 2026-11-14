import { BusinessRuleError } from '../_shared/business-error';
import { SERVICE_KEYS } from '../_shared/demo-people';
import type { RoleId, UserAccount } from './data';

/** Règles PURES de l'annuaire du personnel local (aucun mot de passe, aucun compte de connexion). */

const ROLES: readonly RoleId[] = ['doctor', 'nurse', 'pharmacist', 'labTech', 'cashier', 'admin'];
export const foldName = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s: string | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ');

function validate(input: Record<string, string>, existing: readonly UserAccount[], ignoreId?: string): Pick<UserAccount, 'name' | 'email' | 'role' | 'service' | 'specialty' | 'registrationNumber'> {
  const name = clean(input.name);
  if (name.length < 2) throw new BusinessRuleError('staffNameRequired');
  const role = input.role as RoleId;
  if (!ROLES.includes(role)) throw new BusinessRuleError('staffRoleInvalid');
  const email = clean(input.email).toLowerCase();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new BusinessRuleError('staffEmailInvalid');
  const others = existing.filter((u) => u.id !== ignoreId);
  if (email && others.some((u) => u.email.toLowerCase() === email)) throw new BusinessRuleError('staffEmailTaken', {}, 'conflict');
  const service = clean(input.service) as UserAccount['service'] | '';
  if (service && !SERVICE_KEYS.includes(service)) throw new BusinessRuleError('staffServiceInvalid');
  if (role === 'doctor' && !service) throw new BusinessRuleError('staffServiceRequired');
  const registrationNumber = clean(input.registrationNumber);
  if (registrationNumber && others.some((u) => (u.registrationNumber ?? '').toLowerCase() === registrationNumber.toLowerCase())) {
    throw new BusinessRuleError('staffRegistrationTaken', {}, 'conflict');
  }
  return { name, email, role, service: service || undefined, specialty: clean(input.specialty) || undefined, registrationNumber: registrationNumber || undefined };
}

export function buildStaff(input: Record<string, string>, existing: readonly UserAccount[], id: string, now: Date): UserAccount {
  return { id, ...validate(input, existing), status: 'active', lastLogin: null, createdAt: now.toISOString() };
}

export function applyStaffUpdate(row: UserAccount, input: Record<string, string>, existing: readonly UserAccount[]): UserAccount {
  return { ...row, ...validate({ name: row.name, email: row.email, role: row.role, service: row.service ?? '', specialty: row.specialty ?? '', registrationNumber: row.registrationNumber ?? '', ...input }, existing, row.id) };
}

export function setStaffStatus(row: UserAccount, to: UserAccount['status']): UserAccount {
  if (row.status === to) throw new BusinessRuleError(to === 'suspended' ? 'staffAlreadySuspended' : 'staffAlreadyActive', {}, 'conflict');
  return { ...row, status: to };
}

/** Médecins actifs (seuls proposés dans les listes de praticiens). */
export const activeDoctors = (staff: readonly UserAccount[]): UserAccount[] => staff.filter((u) => u.role === 'doctor' && u.status === 'active');

/** Retrouve un médecin actif par son nom (insensible à la casse et aux accents). */
export function findDoctor(name: string, staff: readonly UserAccount[]): UserAccount | undefined {
  const needle = foldName(name);
  return needle ? activeDoctors(staff).find((u) => foldName(u.name) === needle) : undefined;
}

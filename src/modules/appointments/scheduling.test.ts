import { describe, expect, it } from 'vitest';
import type { Appointment } from './data';
import {
  addDays,
  addMonths,
  findConflicts,
  layoutLanes,
  localDayKey,
  monthGridDays,
  nextFreeSlot,
  appointmentsOnDay,
  hourBounds,
  occupiesSlot,
  rangeFor,
  timeKey,
  startOfWeek,
  toIso,
  weekDays,
} from './scheduling';

const appt = (id: string, time: string, durationMin: number, practitioner = 'Dr A', status: Appointment['status'] = 'confirmed'): Appointment => ({
  id,
  patientId: 'DEMO-P-001',
  patientName: 'Patient démo',
  service: 'generalMedicine',
  practitioner,
  startsAt: toIso('2026-03-10', time),
  durationMin,
  reason: 'control',
  status,
  history: [],
});

describe('conflits de réservation', () => {
  const existing = [appt('A', '09:00', 30), appt('B', '10:00', 30, 'Dr B')];

  it('détecte un chevauchement pour le même praticien', () => {
    expect(findConflicts(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '09:15'), durationMin: 30 }).map((a) => a.id)).toEqual(['A']);
    expect(findConflicts(existing, { practitioner: 'dr a ', startsAt: toIso('2026-03-10', '08:45'), durationMin: 30 })).toHaveLength(1);
  });
  it('accepte des créneaux contigus (fin exclusive)', () => {
    expect(findConflicts(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '09:30'), durationMin: 30 })).toHaveLength(0);
    expect(findConflicts(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '08:30'), durationMin: 30 })).toHaveLength(0);
  });
  it('ignore les autres praticiens', () => {
    expect(findConflicts(existing, { practitioner: 'Dr B', startsAt: toIso('2026-03-10', '09:00'), durationMin: 30 })).toHaveLength(0);
  });
  it('un rendez-vous annulé ou manqué libère le créneau', () => {
    const freed = [appt('C', '09:00', 30, 'Dr A', 'cancelled'), appt('D', '09:00', 30, 'Dr A', 'noShow')];
    expect(findConflicts(freed, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '09:00'), durationMin: 30 })).toHaveLength(0);
    expect(occupiesSlot('cancelled')).toBe(false);
    expect(occupiesSlot('waiting')).toBe(true);
  });
  it('ignore le rendez-vous en cours de report', () => {
    expect(findConflicts(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '09:10'), durationMin: 20, ignoreId: 'A' })).toHaveLength(0);
  });
  it('sans praticien, ne bloque pas (le serveur arbitre)', () => {
    expect(findConflicts(existing, { practitioner: '  ', startsAt: toIso('2026-03-10', '09:00'), durationMin: 30 })).toHaveLength(0);
  });
});

describe('prochain créneau libre', () => {
  it('saute les créneaux occupés par pas de 15 minutes', () => {
    const existing = [appt('A', '09:00', 30), appt('B', '09:30', 30)];
    const next = nextFreeSlot(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '09:00'), durationMin: 30 });
    expect(next).toBe(toIso('2026-03-10', '10:00'));
  });
  it('renvoie null s’il ne reste rien avant la fin de journée', () => {
    const existing = [appt('A', '17:30', 30)];
    expect(nextFreeSlot(existing, { practitioner: 'Dr A', startsAt: toIso('2026-03-10', '17:30'), durationMin: 60 })).toBeNull();
  });
});

describe('répartition en colonnes', () => {
  it('place côte à côte les rendez-vous qui se chevauchent', () => {
    const laid = layoutLanes([appt('A', '09:00', 60), appt('B', '09:30', 30), appt('C', '11:00', 30)]);
    const get = (id: string) => laid.find((l) => l.item.id === id);
    expect(get('A')?.lanes).toBe(2);
    expect(get('B')?.lane).toBe(1);
    expect(get('C')?.lanes).toBe(1);
  });
});

describe('grilles de calendrier', () => {
  it('semaine du lundi au dimanche', () => {
    expect(startOfWeek('2026-03-11')).toBe('2026-03-09'); // mercredi → lundi
    expect(startOfWeek('2026-03-15')).toBe('2026-03-09'); // dimanche → lundi précédent
    expect(weekDays('2026-03-11')).toHaveLength(7);
  });
  it('mois : 42 jours commençant un lundi et contenant tout le mois', () => {
    const days = monthGridDays('2026-02-14');
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-01-26');
    expect(days).toContain('2026-02-28');
  });
  it('navigation par jours et par mois', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
  });
  it('clé de jour locale', () => {
    expect(localDayKey(toIso('2026-03-10', '23:30'))).toBe('2026-03-10');
  });
});

describe('vues jour, semaine et mois', () => {
  // Mercredi 11 mars 2026 : semaine du lundi 9 au dimanche 15.
  const list = [
    appt('A', '09:00', 30, 'Dr A'),
    appt('B', '08:00', 30, 'Dr B'),
    { ...appt('C', '10:00', 30, 'Dr A'), startsAt: toIso('2026-03-12', '10:00') },
    { ...appt('D', '10:00', 30, 'Dr A'), startsAt: toIso('2026-04-02', '10:00') },
  ];

  it('jour et semaine chargent la semaine entière, le mois charge 6 semaines', () => {
    expect(rangeFor('day', '2026-03-11')).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(rangeFor('week', '2026-03-11')).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(rangeFor('month', '2026-03-11')).toEqual({ from: '2026-02-23', to: '2026-04-05' });
  });
  it('vue jour : rendez-vous du jour, triés, filtrables par praticien', () => {
    expect(appointmentsOnDay(list, '2026-03-10').map((a) => a.id)).toEqual(['B', 'A']);
    expect(appointmentsOnDay(list, '2026-03-10', 'Dr A').map((a) => a.id)).toEqual(['A']);
    expect(appointmentsOnDay(list, '2026-03-11')).toHaveLength(0);
  });
  it('vue semaine : chaque rendez-vous tombe dans la bonne colonne', () => {
    const week = weekDays('2026-03-10');
    const counts = week.map((day) => appointmentsOnDay(list, day).length);
    expect(counts).toEqual([0, 2, 0, 1, 0, 0, 0]);
  });
  it('vue mois : un rendez-vous du mois suivant apparaît dans la grille de mars (semaines débordantes)', () => {
    const grid = monthGridDays('2026-03-11');
    expect(grid).toContain('2026-04-02');
    expect(grid.reduce((n, day) => n + appointmentsOnDay(list, day).length, 0)).toBe(4);
  });
  it('heures de la grille : 7 h – 19 h, élargies si besoin', () => {
    expect(hourBounds(list)).toEqual({ start: 7, end: 19 });
    expect(hourBounds([appt('E', '05:30', 60), appt('F', '19:30', 60)])).toEqual({ start: 5, end: 21 });
  });
  it('heure locale d’un champ de saisie', () => {
    expect(timeKey(toIso('2026-03-10', '07:05'))).toBe('07:05');
  });
});

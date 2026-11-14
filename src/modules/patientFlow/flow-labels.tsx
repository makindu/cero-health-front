import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import type { FlowEvent, Place } from './flow-rules';

const TONE: Record<Place, StatusTone> = { reception: 'info', triage: 'warning', consultation: 'info', laboratory: 'neutral', pharmacy: 'success', cashier: 'neutral', ward: 'warning' };

/** « Laboratoire — Prélevé » : lieu + étape, avec traductions du namespace patientFlow. */
export function useFlowText() {
  const { t } = useTranslation('patientFlow');
  const { t: tc } = useTranslation();
  return {
    place: (p: Place): string => t(`place.${p}`),
    step: (e: FlowEvent): string => t(`step.${e.place}.${e.step}`, { defaultValue: e.step }),
    detail: (e: FlowEvent): string => [e.ref, e.detail ? (e.place === 'ward' || e.place === 'reception' || e.place === 'consultation' ? tc(`services.${e.detail}`, { defaultValue: e.detail }) : e.detail) : ''].filter(Boolean).join(' · '),
  };
}

export function PlaceBadge({ place }: { place: Place }) {
  const x = useFlowText();
  return <StatusBadge tone={TONE[place]}>{x.place(place)}</StatusBadge>;
}

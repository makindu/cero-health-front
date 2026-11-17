import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import type { Consultation } from '../consultations/data';
import { buildConsultationReport } from '../consultations/report';
import type { Admission } from '../hospitalization/hospital-rules';
import { RichTextView } from '../hospitalization/RichTextView';
import { docToText } from '../consultations/richtext/doc';
import { toDoc, type Visit } from '../hospitalization/visit-rules';
import type { LabOrder } from '../laboratory/lab-rules';
import type { Rx } from '../prescriptions/rx-rules';
import { loadConsultationDraft, type RecordAdmission } from './record-content';

const NS = ['medicalRecords', 'consultations', 'prescriptions', 'laboratory', 'hospitalization'] as const;

export function ConsultationDetail({ item }: { item: Consultation }) {
  const { t } = useTranslation([...NS]);
  const f = useFormatters();
  const { activeFacilityId } = usePreferences();
  const draft = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'medicalRecords', 'consultation-draft', item.id), queryFn: () => loadConsultationDraft(item.id), gcTime: 0 });
  // Compte rendu : uniquement ce que le praticien a saisi (jamais de valeur par défaut). Un brouillon illisible n'empêche pas d'afficher le reste.
  const sections = (() => {
    if (!draft.data) return [];
    try {
      return buildConsultationReport(draft.data, { t: t as never, facility: '', patientLines: [], practitionerLines: [], dateTime: f.dateTime, isDemo: false }).sections;
    } catch { return []; }
  })();
  return (
    <div className="space-y-4">
      <DetailSection title={t('consultations:detail.summary')}>
        <DescriptionList items={[
          { label: t('consultations:columns.date'), value: f.dateTime(item.date) },
          { label: t('consultations:columns.practitioner'), value: item.practitioner },
          { label: t('consultations:columns.service'), value: t(`services.${item.service}`) },
          { label: t('consultations:columns.reason'), value: t(`consultations:reason.${item.reason}`) },
          { label: t('consultations:columns.status'), value: t(`consultations:status.${item.status}`) },
          { label: t('consultations:detail.reference'), value: item.id },
        ]} />
      </DetailSection>
      <DetailSection title={t('consultations:detail.clinical')}>
        {draft.isPending ? <p className="text-sm text-muted-foreground">{t('medicalRecords:content.loading')}</p>
          : sections.length === 0 ? <p className="text-sm text-muted-foreground">{t('medicalRecords:content.noClinical')}</p>
          : sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <p className="text-sm font-medium">{s.title}</p>
              <RichTextView value={s.doc} />
            </div>
          ))}
      </DetailSection>
    </div>
  );
}

export function RxDetail({ item }: { item: Rx }) {
  const { t } = useTranslation([...NS]);
  const f = useFormatters();
  return (
    <div className="space-y-4">
      <DetailSection title={t('prescriptions:detail.summary')}>
        <DescriptionList items={[
          { label: t('prescriptions:columns.number'), value: item.number },
          { label: t('prescriptions:columns.date'), value: f.dateTime(item.prescribedAt) },
          { label: t('prescriptions:columns.practitioner'), value: item.prescriber },
          { label: t('prescriptions:columns.status'), value: t(`prescriptions:status.${item.status}`) },
          ...(item.validation ? [{ label: t('prescriptions:detail.validatedBy'), value: `${item.validation.by} · ${f.dateTime(item.validation.at)}` }] : []),
          ...(item.cancellation ? [{ label: t('prescriptions:detail.cancelledBy'), value: `${item.cancellation.by} · ${f.dateTime(item.cancellation.at)} — ${item.cancellation.reason}` }] : []),
        ]} />
      </DetailSection>
      <DetailSection title={t('prescriptions:detail.items')}>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {item.items.map((i, n) => (
            <li key={n} className="p-2">
              <strong>{i.label}</strong> × {i.quantity}
              <span className="block text-xs text-muted-foreground">
                {[`${t('prescriptions:fields.dosage')} : ${i.dosage}`, `${t('prescriptions:fields.frequency')} : ${i.frequency}`, i.duration && `${t('prescriptions:fields.duration')} : ${i.duration}`, i.instructions && `${t('prescriptions:fields.instructions')} : ${i.instructions}`].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
        {item.note && <p className="pt-2 text-sm">{item.note}</p>}
      </DetailSection>
    </div>
  );
}

export function LabDetail({ item }: { item: LabOrder }) {
  const { t } = useTranslation([...NS]);
  const f = useFormatters();
  const label = (code: string) => item.tests.find((x) => x.code === code)?.label ?? code;
  return (
    <div className="space-y-4">
      <DetailSection title={t('laboratory:detail.summary')}>
        <DescriptionList items={[
          { label: t('laboratory:columns.number'), value: item.number },
          { label: t('laboratory:columns.requestedAt'), value: f.dateTime(item.requestedAt) },
          { label: t('laboratory:detail.requestedBy'), value: item.requestedBy },
          { label: t('laboratory:columns.priority'), value: t(`laboratory:priority.${item.priority}`) },
          { label: t('laboratory:columns.status'), value: t(`laboratory:status.${item.status}`) },
          ...(item.collected ? [{ label: t('laboratory:status.collected'), value: t('laboratory:detail.collectedBy', { by: item.collected.by, at: f.dateTime(item.collected.at) }) }] : []),
          ...(item.validation ? [{ label: t('laboratory:status.validated'), value: t('laboratory:detail.validatedBy', { by: item.validation.by, at: f.dateTime(item.validation.at) }) }] : []),
        ]} />
        {item.clinicalNote && <p className="pt-2 text-sm"><strong>{t('laboratory:create.note')} :</strong> {item.clinicalNote}</p>}
      </DetailSection>
      <DetailSection title={t('laboratory:detail.tests')}>
        <ul className="list-disc ps-5 text-sm">{item.tests.map((x) => <li key={x.code}>{x.label}</li>)}</ul>
      </DetailSection>
      <DetailSection title={t('laboratory:detail.results')}>
        {item.results.length === 0 ? <p className="text-sm text-muted-foreground">{t('medicalRecords:content.noResults')}</p> : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {item.results.map((r) => (
              <li key={r.code} className="p-2">
                <strong>{label(r.code)}</strong> : {r.value} {r.unit}
                <span className="block text-xs text-muted-foreground">
                  {[r.referenceRange && `Réf. ${r.referenceRange}`, `${t('laboratory:detail.flag')} : ${t(`laboratory:flag.${r.flag}`)}`, r.comment].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );
}

/** Une visite du séjour : les quatre étapes cliniques telles que saisies (lecture seule). */
function VisitBlock({ visit }: { visit: Visit }) {
  const { t } = useTranslation([...NS]);
  const f = useFormatters();
  const c = visit.clinical;
  return (
    <li className="space-y-1 rounded-md border border-border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{f.dateTime(visit.visitedAt)} · {visit.by} · {t(`hospitalization:visits.types.${visit.type}`)}</p>
      {!c && <p className="text-muted-foreground">{t('medicalRecords:content.noClinical')}</p>}
      {c?.complaints && <div><p className="font-medium">{t('hospitalization:visits.clinical.step1')}</p>{c.complaints.none ? <p>{t('hospitalization:visits.clinical.noComplaint')}</p> : <RichTextView value={c.complaints.text} />}</div>}
      {c?.examination && <div><p className="font-medium">{t('hospitalization:visits.clinical.step2')} — {t(`hospitalization:visits.clinical.evolutions.${c.examination.evolution}`)}</p><RichTextView value={c.examination.text} /></div>}
      {c?.diagnosis && <p><strong>{t('hospitalization:visits.clinical.step3')} :</strong> {c.diagnosis}</p>}
      {c?.plan && (
        <div>
          <p className="font-medium">{t('hospitalization:visits.clinical.step4')} : {[c.plan.treatment ? t(`hospitalization:visits.clinical.treatments.${c.plan.treatment}`) : null, c.plan.labs ? t('hospitalization:visits.clinical.planLabs') : null, c.plan.discharge ? t('hospitalization:visits.clinical.planDischarge') : null].filter(Boolean).join(' · ')}</p>
          {docToText(toDoc(c.plan.note)) !== '' && <RichTextView value={c.plan.note} />}
        </div>
      )}
    </li>
  );
}

export function AdmissionRecordDetail({ item }: { item: RecordAdmission }) {
  const { t } = useTranslation([...NS]);
  const f = useFormatters();
  const a: Admission = item.admission;
  return (
    <div className="space-y-4">
      <DetailSection title={t('hospitalization:detail.summary')}>
        <DescriptionList items={[
          { label: t('hospitalization:columns.number'), value: a.number },
          { label: t('hospitalization:columns.ward'), value: t(`services.${a.ward}`) },
          { label: t('hospitalization:columns.status'), value: t(`hospitalization:admissionStatus.${a.status}`) },
          { label: t('hospitalization:columns.admittedAt'), value: f.dateTime(a.admittedAt) },
          { label: t('hospitalization:detail.attending'), value: a.attending },
          { label: t('hospitalization:detail.reasonLabel'), value: a.reason },
          ...(a.discharge ? [{ label: t('hospitalization:account.discharge'), value: `${t(`hospitalization:outcome.${a.discharge.outcome}`)} · ${f.dateTime(a.discharge.at)}` }] : []),
        ]} />
      </DetailSection>
      <DetailSection title={t('medicalRecords:content.visitsTitle', { count: item.visits.length })}>
        {item.visits.length === 0 ? <p className="text-sm text-muted-foreground">{t('medicalRecords:content.none')}</p> : <ul className="space-y-2">{item.visits.map((v) => <VisitBlock key={v.id} visit={v} />)}</ul>}
      </DetailSection>
    </div>
  );
}

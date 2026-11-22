import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/feedback/toast';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ApiError, queryKeys } from '@/core/api';
import { useAuth } from '@/core/auth/cero-id';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { describeBusinessError } from '../_shared/business-error';
import { consultationService } from '../consultations/data';
import { appointmentService, type Appointment } from './data';
import { useStaffMembers } from '../_shared/reference-data';
import { findMyStaff } from '../dashboard/my-queue';
import { consultationInputFor, isUnassigned } from './start-consultation';

/** Consultation déjà ouverte pour ce rendez-vous (le serveur n'en autorise qu'une par rendez-vous). */
async function existingConsultationId(appointmentId: string): Promise<string | undefined> {
  const found = await consultationService.list({ page: 1, perPage: 1, search: '', filters: { appointment_id: appointmentId }, sort: null });
  return found.rows[0]?.id;
}

/**
 * « Ouvrir la consultation » : crée la consultation liée au rendez-vous, appelle le patient (statut « en cours »), puis
 * ouvre le dossier clinique. Si la consultation existe déjà, on la reprend. Le serveur revérifie droits et statuts.
 */
export function StartConsultationButton({ appointment }: { appointment: Appointment }) {
  const { t } = useTranslation('appointments');
  const { t: tc } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [confirming, setConfirming] = useState(false);
  const resume = appointment.status === 'inProgress';
  const unassigned = isUnassigned(appointment);
  const { user } = useAuth();
  const staff = useStaffMembers();
  const me = findMyStaff(staff.data ?? [], user?.id);

  const mutation = useMutation({
    mutationFn: async (): Promise<string | 'demo'> => {
      // Patient sans médecin : le soignant qui le prend en charge devient son médecin (avant d'ouvrir la consultation).
      if (unassigned && !resume && me) await appointmentService.command(appointment.id, 'assign', { practitioner: me.name });
      const existing = resume ? await existingConsultationId(appointment.id) : undefined;
      if (existing) return existing;
      let id: string | undefined;
      try {
        const created = await consultationService.create(consultationInputFor(appointment, me?.id));
        if (created.isDemo) return 'demo';
        id = created.id;
      } catch (error) {
        // Déjà ouverte (par un collègue ou lors d'un essai précédent) : on la reprend au lieu d'échouer.
        if ((error as { status?: number } | null)?.status === 409) id = await existingConsultationId(appointment.id);
        if (!id) throw error;
      }
      if (appointment.status !== 'inProgress') await appointmentService.command(appointment.id, 'start');
      if (!id) throw new ApiError('validation', 'Consultation introuvable.', { source: 'health', status: 404 });
      return id;
    },
    onSuccess: (id) => {
      setConfirming(false);
      if (id === 'demo') {
        toast({ tone: 'warning', title: tc('module.demoNotSaved'), description: tc('module.demoNotSavedHint') });
        return;
      }
      for (const name of ['appointments', 'consultations', 'triage']) void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, name) });
      navigate(`/consultations/${encodeURIComponent(id)}`);
    },
    onError: (error) => {
      setConfirming(false);
      toast({ tone: 'danger', title: tc('module.saveFailed'), description: describeBusinessError(tc, error) ?? tc('module.saveFailedHint') });
    },
  });

  return (
    <Can permission={PERMISSIONS.consultations.create}>
      <Button size="sm" leftIcon={<Stethoscope className="size-4" />} disabled={unassigned && !resume && !me} onClick={() => setConfirming(true)}>
        {resume ? t('actions.resumeConsultation') : unassigned ? t('actions.takeCharge') : t('actions.openConsultation')}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={unassigned && !resume ? t('confirmTitles.takeCharge') : t('confirmTitles.openConsultation')}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </Can>
  );
}

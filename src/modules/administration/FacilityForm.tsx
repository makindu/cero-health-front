import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/feedback/spinner';
import { useAuth } from '@/core/auth/cero-id';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { logoUrl, useFacilityProfile } from './facility-api';

/** Fiche de l'établissement actif — lecture seule : toute modification se fait dans CERO ID. */
export function FacilityForm() {
  const { t } = useTranslation('administration');
  const { activeFacility } = useAuth();
  const profile = useFacilityProfile(activeFacility?.id);
  const [failedLogo, setFailedLogo] = useState<number | null>(null);
  const logo = logoUrl(activeFacility?.id);
  // Jamais la fiche d'un autre établissement : on ignore une réponse qui ne correspond pas à l'établissement actif.
  const p = profile.data && profile.data.id === activeFacility?.id ? profile.data : undefined;
  const name = p?.name || activeFacility?.name || '';

  return (
    <Card title={t('facility.viewTitle')} description={t('facility.viewDescription')}>
      <div className="mb-5 flex items-center gap-4">
        {logo && failedLogo !== activeFacility?.id ? (
          <img
            key={activeFacility?.id}
            src={logo}
            alt={t('facility.logoAlt', { name })}
            className="h-20 w-20 rounded-md border border-border bg-white object-contain p-1"
            onError={() => setFailedLogo(activeFacility?.id ?? null)}
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground" aria-hidden>
            <Building2 className="h-8 w-8" />
          </span>
        )}
        <div>
          <p className="text-lg font-semibold text-foreground">{name}</p>
          {p?.category ? <p className="text-sm text-muted-foreground">{p.category}</p> : null}
        </div>
      </div>

      {profile.isLoading || (profile.isFetching && !p) ? (
        <Skeleton className="h-32 w-full" />
      ) : p ? (
        <div className="space-y-5">
          {p.description ? <p className="text-sm text-foreground">{p.description}</p> : null}
          <DetailSection title={t('facility.contact')}>
            <DescriptionList
              items={[
                { label: t('facility.phone'), value: p.phone },
                { label: t('facility.email'), value: p.mail },
                { label: t('facility.address'), value: p.address },
                { label: t('facility.website'), value: p.website },
              ]}
            />
          </DetailSection>
          <DetailSection title={t('facility.legal')}>
            <DescriptionList
              items={[
                { label: t('facility.rccm'), value: p.rccm },
                { label: t('facility.nationalId'), value: p.nationalId },
                { label: t('facility.taxNumber'), value: p.taxNumber },
                { label: t('facility.authorization'), value: p.authorization },
              ]}
            />
          </DetailSection>
          {p.facebook || p.instagram || p.linkedin ? (
            <DetailSection title={t('facility.social')}>
              <DescriptionList
                items={[
                  { label: 'Facebook', value: p.facebook },
                  { label: 'Instagram', value: p.instagram },
                  { label: 'LinkedIn', value: p.linkedin },
                ]}
              />
            </DetailSection>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('facility.unavailable')}</p>
      )}
      <p className="mt-5 text-xs text-muted-foreground">{t('facility.managedByIdCore')}</p>
    </Card>
  );
}

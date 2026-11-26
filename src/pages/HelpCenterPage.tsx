
import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';

import {
  BookOpen,
  Download,
  Headset,
  Monitor,
  ShieldCheck,
} from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

const HELP_SECTIONS = [
  { id: 'userGuide', icon: BookOpen },
  { id: 'desktop', icon: Monitor },
  { id: 'updates', icon: Download },
  { id: 'support', icon: Headset },
] as const;

export default function HelpCenterPage() {
  const { t } = useTranslation('help');

  const [installedVersion, setInstalledVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;

    void getVersion()
      .then((version) => {
        if (active) {
          setInstalledVersion(version);
        }
      })
      .catch((error: unknown) => {
        console.error(
          '[CERO HEALTH] Impossible de récupérer la version installée:',
          error,
        );
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto w-full max-w-7xl space-y-7">
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
        />

        <section className="rounded-xl border border-border bg-surface p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <ShieldCheck className="size-8" aria-hidden />
            </div>

            <div>
              <h2 className="text-xl font-semibold">
                {t('welcome.title')}
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {t('welcome.description')}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t('sectionsTitle')}
          </h2>

          <div className="grid gap-4 xl:grid-cols-2">
            {HELP_SECTIONS.map(({ id, icon: Icon }) => {
              const items = t(`sections.${id}.items`, {
                returnObjects: true,
              }) as string[];

              return (
                <Card
                  key={id}
                  title={t(`sections.${id}.title`)}
                  description={t(`sections.${id}.description`)}
                >
                  <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </div>

                  <ul className="space-y-3">
                    {items.map((item, index) => (
                      <li
                        key={`${id}-${index}`}
                        className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"
                      >
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {id === 'updates' && (
                    <div className="mt-4 rounded-lg border border-border bg-surface-muted p-3 text-sm text-muted-foreground">
                      {t('sections.updates.status')}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        <Card
          title={t('about.title')}
          description={t('about.description')}
        >
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('about.publisher')}
              </dt>

              <dd className="mt-1 font-medium">
                {t('about.publisherName')}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">
                {t('about.application')}
              </dt>

              <dd className="mt-1 font-medium">
                {t('about.applicationName')}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">
                {t('about.version')}
              </dt>

              <dd className="mt-1 font-medium tabular-nums">
                {installedVersion ?? t('about.versionValue')}
              </dd>
            </div>
          </dl>
        </Card>

        <p className="pb-2 text-center text-xs text-muted-foreground">
          {t('footer')}
        </p>
      </div>
    </main>
  );
}

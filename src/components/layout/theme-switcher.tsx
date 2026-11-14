import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { useTheme } from '@/core/theme/ThemeProvider';
import type { ThemeMode } from '@/core/preferences/preferences-store';

const OPTIONS = [
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
  { mode: 'system', icon: Monitor },
] as const satisfies readonly { mode: ThemeMode; icon: typeof Sun }[];

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { mode, resolved, setMode } = useTheme();
  const CurrentIcon = resolved === 'dark' ? Moon : Sun;
  return (
    <Dropdown label={t('theme.label')} trigger={<CurrentIcon aria-hidden className="size-5" />}>
      {(close) =>
        OPTIONS.map(({ mode: option, icon: Icon }) => (
          <DropdownItem
            key={option}
            selected={mode === option}
            icon={<Icon className="size-4" />}
            onClick={() => {
              setMode(option);
              close();
            }}
          >
            {t(`theme.${option}`)}
          </DropdownItem>
        ))
      }
    </Dropdown>
  );
}

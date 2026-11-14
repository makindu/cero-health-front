import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { availableLanguages, setLanguage } from '@/core/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <Dropdown
      label={t('language.label')}
      trigger={
        <>
          <Languages aria-hidden className="size-5" />
          <span aria-hidden className="text-xs font-semibold uppercase">
            {i18n.language.slice(0, 2)}
          </span>
        </>
      }
    >
      {(close) =>
        availableLanguages.map((language) => (
          <DropdownItem
            key={language.code}
            selected={i18n.language === language.code}
            lang={language.code}
            onClick={() => {
              void setLanguage(language.code);
              close();
            }}
          >
            {language.nativeName}
          </DropdownItem>
        ))
      }
    </Dropdown>
  );
}

import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { spaces } from '../../data/spaces';
import './Header.css';

const LANGUAGES = ['en', 'ca', 'es'] as const;

export function Header() {
  const { t, i18n } = useTranslation();
  const { mode, flow, resetFlow, triggerMapReset } = useAppStore();

  // Resolve the currently selected space for breadcrumb
  const selectedSpace =
    mode === 'suggest' && flow.selectedSpaceId
      ? spaces.find((s) => s.id === flow.selectedSpaceId)
      : null;

  const handleLogoClick = () => {
    resetFlow();
    triggerMapReset();
  };

  const handleLangChange = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="header-logo" onClick={handleLogoClick}>
          <span className="logo-mark">BCN</span>
          <span className="logo-text">{t('header.title').replace('BCN ', '')}</span>
        </h1>
      </div>
      <div className="header-center">
        {selectedSpace ? (
          <span className="header-breadcrumb">
            {t('header.nav.barcelona')} →{' '}
            {t(`spaces.${selectedSpace.id}.neighborhood`, {
              defaultValue: selectedSpace.neighborhood,
            })}{' '}
            →{' '}
            {t(`spaces.${selectedSpace.id}.name`, {
              defaultValue: selectedSpace.name,
            })}
          </span>
        ) : (
          <span className="header-tagline">{t('header.tagline')}</span>
        )}
      </div>
      <div className="header-right">
        <div className="lang-switcher">
          {LANGUAGES.map((lng) => (
            <button
              key={lng}
              className={`lang-btn${i18n.language === lng ? ' active' : ''}`}
              onClick={() => handleLangChange(lng)}
              aria-label={lng.toUpperCase()}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

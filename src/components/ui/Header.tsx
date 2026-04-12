import { useState, useCallback, useEffect } from 'react';
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

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

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
        <button
          className="fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 4 20 10 20" />
              <polyline points="20 10 20 4 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

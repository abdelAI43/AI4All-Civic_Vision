import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';

export function POVSelector() {
  const { t } = useTranslation();
  const { flow, setSelectedPov } = useAppStore();

  const space = spaces.find((s) => s.id === flow.selectedSpaceId);
  if (!space) return null;

  return (
    <>
      {/* POV grid — space name shown in panel header */}
      <div className="pov-grid">
        {space.povImages.map((pov) => {
          const isSelected = flow.selectedPovId === pov.id;

          return (
            <button
              key={pov.id}
              className={`pov-card${isSelected ? ' selected' : ''}`}
              onClick={() => setSelectedPov(pov.id)}
              aria-pressed={isSelected}
              aria-label={pov.label}
            >
              <span className="pov-card-selected-icon" aria-hidden="true">✓</span>

              <img
                className="pov-card-image"
                src={pov.path}
                alt={pov.label}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.4';
                }}
              />

              <div className="pov-card-label">
                <span>{pov.label}</span>
                {pov.isPlaceholder && (
                  <span className="pov-card-placeholder-badge">
                    {t('common.placeholder')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';

export function SpaceSelector() {
  const { t } = useTranslation();
  const { flow, setSelectedSpace } = useAppStore();

  return (
    <div className="space-grid">
      {spaces.map((space) => {
        const thumbnail = space.povImages[0];
        const isSelected = flow.selectedSpaceId === space.id;

        return (
          <button
            key={space.id}
            className={`space-card${isSelected ? ' selected' : ''}`}
            onClick={() => setSelectedSpace(space.id)}
            aria-pressed={isSelected}
            aria-label={t(`spaces.${space.id}.name`, { defaultValue: space.name })}
          >
            <span className="space-card-check" aria-hidden="true">✓</span>

            <img
              className="space-card-image"
              src={thumbnail.path}
              alt={t(`spaces.${space.id}.name`, { defaultValue: space.name })}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />

            <div className="space-card-body">
              <p className="space-card-name">
                {t(`spaces.${space.id}.name`, { defaultValue: space.name })}
              </p>
              <p className="space-card-neighborhood">
                {t(`spaces.${space.id}.neighborhood`, { defaultValue: space.neighborhood })}
              </p>
              <span className="space-card-type">{space.type}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

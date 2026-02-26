import { Marker } from 'react-map-gl/mapbox';
import type { Space } from '../../types';
import './HotspotMarker.css';

interface Props {
  space: Space;
  hasProposal: boolean;
  onClick: (id: string) => void;
}

export function HotspotMarker({ space, hasProposal, onClick }: Props) {
  return (
    <Marker
      longitude={space.lng}
      latitude={space.lat}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick(space.id);
      }}
    >
      <div className="hotspot-marker-wrapper" title={space.name}>
        <div className={`hotspot-marker ${hasProposal ? 'has-proposal' : ''}`}>
          <div className="hotspot-pulse" />
          <div className="hotspot-dot" />
        </div>
        <span className="hotspot-label">{space.name}</span>
      </div>
    </Marker>
  );
}

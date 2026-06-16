import { useRef, useCallback, useEffect } from 'react';
import Map, { type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { spaces } from '../../data/spaces';
import { getProposalsForSpace } from '../../data/mockProposals';
import { useAppStore } from '../../store/useAppStore';
import { HotspotMarker } from './HotspotMarker';
import { HeatmapLayer } from './HeatmapLayer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const INITIAL_VIEW = {
  longitude: 2.1734,
  latitude: 41.3870,
  zoom: 14,
  pitch: 60,
  bearing: -17,
};

export function MapView() {
  const mapRef = useRef<MapRef>(null);
  const { mode, setBrowseSpaceId, setBrowseProposal, mapResetTrigger } = useAppStore();

  const handleSpaceClick = useCallback(
    (spaceId: string) => {
      // In browse mode, clicking a marker shows the proposals list for that space
      if (mode !== 'browse') return;

      const space = spaces.find((s) => s.id === spaceId);

      setBrowseSpaceId(spaceId);
      setBrowseProposal(null); // clear any open detail

      if (space) {
        mapRef.current?.flyTo({
          center: [space.lng, space.lat],
          zoom: 17,
          pitch: 65,
          bearing: Math.random() * 40 - 20,
          duration: 2000,
          essential: true,
        });
      }
    },
    [mode, setBrowseSpaceId, setBrowseProposal]
  );

  // Add 3D buildings on map load
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const layers = map.getStyle().layers;
    let labelLayerId: string | undefined;
    if (layers) {
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.layout as Record<string, unknown>)?.['text-field']) {
          labelLayerId = layer.id;
          break;
        }
      }
    }

    if (!map.getLayer('3d-buildings')) {
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#D5CEC5',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7,
          },
        },
        labelLayerId
      );
    }
  }, []);

  // Escape to reset (only when suggest flow is NOT open)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'browse') {
        setBrowseProposal(null);
        setBrowseSpaceId(null);
        mapRef.current?.flyTo({
          ...INITIAL_VIEW,
          center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
          duration: 1500,
          essential: true,
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, setBrowseProposal, setBrowseSpaceId]);

  // Reset map view when logo is clicked
  useEffect(() => {
    if (mapResetTrigger > 0) {
      setBrowseProposal(null);
      setBrowseSpaceId(null);
      mapRef.current?.flyTo({
        ...INITIAL_VIEW,
        center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
        duration: 1500,
        essential: true,
      });
    }
  }, [mapResetTrigger, setBrowseProposal, setBrowseSpaceId]);

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: '100%', height: '100%' }}
      onLoad={onMapLoad}
      maxBounds={[
        [1.9, 41.3],
        [2.35, 41.5],
      ]}
      minZoom={12}
      maxZoom={19}
      antialias
    >
      {spaces.map((space) => {
        const hasProposal = getProposalsForSpace(space.id).length > 0;
        return (
          <HotspotMarker
            key={space.id}
            space={space}
            hasProposal={hasProposal}
            onClick={handleSpaceClick}
          />
        );
      })}
      <HeatmapLayer />
    </Map>
  );
}

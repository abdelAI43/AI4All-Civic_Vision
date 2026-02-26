import { useEffect, useState } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import { spaces } from '../../data/spaces';
import { supabase } from '../../lib/supabase';

interface HeatmapPoint {
  spaceId: string;
  lat: number;
  lng: number;
  avgScore: number;
}

type HeatmapRow = { space_id: string; proposal_count: unknown; avg_score: unknown };

function rowsToPoints(data: HeatmapRow[]): HeatmapPoint[] {
  return data
    .map((row) => {
      const space = spaces.find((s) => s.id === row.space_id);
      if (!space) return null;
      return {
        spaceId: row.space_id,
        lat: space.lat,
        lng: space.lng,
        avgScore: parseFloat(String(row.avg_score ?? 0)),
      };
    })
    .filter((p): p is HeatmapPoint => p !== null);
}

/**
 * Shows a live heatmap of proposal density on the map.
 * Reads from the `heatmap_data` Supabase view and subscribes to
 * Realtime INSERT events on the proposals table for live updates.
 */
export function HeatmapLayer() {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch
    supabase
      .from('heatmap_data')
      .select('space_id, proposal_count, avg_score')
      .then(({ data }) => {
        if (!cancelled && data) setPoints(rowsToPoints(data as HeatmapRow[]));
      });

    // Live updates — re-fetch when a new proposal is inserted
    const channel = supabase
      .channel('heatmap-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'proposals' },
        () => {
          supabase
            .from('heatmap_data')
            .select('space_id, proposal_count, avg_score')
            .then(({ data }) => {
              if (!cancelled && data) setPoints(rowsToPoints(data as HeatmapRow[]));
            });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { weight: p.avgScore / 5 },
    })),
  };

  const heatmapPaint: Record<string, unknown> = {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': 1,
    'heatmap-radius': 60,
    'heatmap-opacity': 0.3,
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0, 'rgba(107,143,113,0)',
      0.3, 'rgba(107,143,113,0.4)',
      0.6, 'rgba(196,148,58,0.6)',
      1, 'rgba(212,118,60,0.8)',
    ],
  };

  return (
    <Source id="proposal-heatmap" type="geojson" data={geojson}>
      <Layer
        id="proposal-heatmap-layer"
        type="heatmap"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paint={heatmapPaint as any}
      />
    </Source>
  );
}

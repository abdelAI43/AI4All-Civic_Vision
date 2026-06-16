/* -----------------------------------------------------------------------
   GET /api/proposals/heatmap
   Returns: { success: true, data: HeatmapPoint[] }
   where HeatmapPoint = { spaceId, lat, lng, avgScore, count }

   Reads from the `heatmap_data` view + joins with static space coordinates.
   ----------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../_types';

// Static space coordinates — matches src/data/spaces.ts
const SPACE_COORDS: Record<string, { lat: number; lng: number }> = {
  'placa-catalunya':   { lat: 41.3870, lng: 2.1700 },
  'la-rambla':         { lat: 41.3809, lng: 2.1734 },
  'passeig-de-gracia': { lat: 41.3927, lng: 2.1649 },
  'barceloneta-beach': { lat: 41.3782, lng: 2.1925 },
  'park-guell':        { lat: 41.4145, lng: 2.1527 },
  'mnac-esplanade':    { lat: 41.3716, lng: 2.1512 },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey);

    const { data, error } = await supabase
      .from('heatmap_data')
      .select('space_id, proposal_count, avg_score');

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const points = (data ?? [])
      .map((row) => {
        const coords = SPACE_COORDS[row.space_id as string];
        if (!coords) return null;
        return {
          spaceId:  row.space_id as string,
          lat:      coords.lat,
          lng:      coords.lng,
          avgScore: parseFloat(String(row.avg_score ?? 0)),
          count:    Number(row.proposal_count ?? 0),
        };
      })
      .filter(Boolean);

    return res.status(200).json({ success: true, data: points });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Heatmap query failed: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
}

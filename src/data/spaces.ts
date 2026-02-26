/* --------------------------------------------------------
   Barcelona Civic Vision — Spaces & POV image registry
   --------------------------------------------------------
   To add/replace a photo:
     1. Drop the file at:  public/images/{space-id}/{filename}
     2. Update the entry below:  isPlaceholder: false, correct path
   -------------------------------------------------------- */

export interface SpacePOV {
  /** Kebab-case identifier used in API calls and URL params. */
  id: string;
  /** Display label shown in the UI. */
  label: string;
  /** Absolute path from /public root. */
  path: string;
  /** True while the real photograph has not been sourced yet. */
  isPlaceholder: boolean;
}

export interface Space {
  id: string;
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  type: 'square' | 'boulevard' | 'beach' | 'park' | 'esplanade';
  description: string;
  povImages: SpacePOV[];
}

export const spaces: Space[] = [
  {
    id: 'placa-catalunya',
    name: 'Plaça Catalunya',
    neighborhood: 'Eixample / Barri Gòtic',
    lat: 41.3870,
    lng: 2.1700,
    type: 'square',
    description: 'The symbolic heart of Barcelona — a vast public square at the junction of the old city and the Eixample grid.',
    povImages: [
      { id: 'building',   label: 'Building',   path: '/images/placa-catalunya/building.jpg',   isPlaceholder: false },
      { id: 'pedestrian', label: 'Pedestrian', path: '/images/placa-catalunya/pedestrian.jpg', isPlaceholder: false },
      { id: 'night',      label: 'Night',       path: '/images/placa-catalunya/night.jpg',      isPlaceholder: false },
      { id: 'top-view',   label: 'Top View',    path: '/images/placa-catalunya/top view.jpg',   isPlaceholder: false },
    ],
  },
  {
    id: 'la-rambla',
    name: 'La Rambla',
    neighborhood: 'Barri Gòtic / El Raval',
    lat: 41.3809,
    lng: 2.1734,
    type: 'boulevard',
    description: 'Barcelona\'s most famous pedestrian boulevard, stretching 1.2 km from Plaça Catalunya to the sea.',
    povImages: [
      { id: 'overview',    label: 'Overview',     path: '/images/la-rambla/overview.jpg',          isPlaceholder: false },
      { id: 'pedestrian',  label: 'Pedestrian',  path: '/images/la-rambla/pedestrian.jpg',       isPlaceholder: false },
      { id: 'placa-reial', label: 'Plaça Reial',  path: '/images/la-rambla/pla\u00E7a reial.jpg', isPlaceholder: false },
      { id: 'resident',    label: 'Resident',     path: '/images/la-rambla/resident.jpg',          isPlaceholder: false },
    ],
  },
  {
    id: 'passeig-de-gracia',
    name: 'Passeig de Gràcia',
    neighborhood: 'Eixample',
    lat: 41.3927,
    lng: 2.1649,
    type: 'boulevard',
    description: 'The grand modernista avenue lined with Gaudí and Domènech i Montaner masterpieces.',
    povImages: [
      { id: 'rooftop',    label: 'Rooftop',     path: '/images/passeig-de-gracia/rooftop.jpg',    isPlaceholder: false },
      { id: 'pedestrian', label: 'Pedestrian', path: '/images/passeig-de-gracia/pedestrian.jpg', isPlaceholder: false },
      { id: 'overview',   label: 'Overview',   path: '/images/passeig-de-gracia/overview.jpg',   isPlaceholder: false },
      { id: 'road',       label: 'Road',        path: '/images/passeig-de-gracia/road.jpg',       isPlaceholder: false },
    ],
  },
  {
    id: 'barceloneta-beach',
    name: 'Barceloneta Beach',
    neighborhood: 'Barceloneta',
    lat: 41.3782,
    lng: 2.1925,
    type: 'beach',
    description: 'The city\'s iconic urban beach — 1.1 km of sand connecting the old fishing quarter to the sea.',
    povImages: [
      { id: 'beach',      label: 'Beach',      path: '/images/barceloneta-beach/beach.jpg',      isPlaceholder: false },
      { id: 'pedestrian', label: 'Pedestrian', path: '/images/barceloneta-beach/pedestrian.jpg', isPlaceholder: false },
      { id: 'cyclist',    label: 'Cyclist',    path: '/images/barceloneta-beach/cyclist.jpg',    isPlaceholder: false },
      { id: 'esplanade',  label: 'Esplanade',  path: '/images/barceloneta-beach/esplanade.jpg',  isPlaceholder: false },
    ],
  },
  {
    id: 'park-guell',
    name: 'Park Güell',
    neighborhood: 'Gràcia / Carmel',
    lat: 41.4145,
    lng: 2.1527,
    type: 'park',
    description: 'Gaudí\'s monumental park — a UNESCO World Heritage site overlooking the entire city.',
    povImages: [
      { id: 'overview', label: 'Overview', path: '/images/park-guell/overview.jpg', isPlaceholder: false },
      { id: 'court',    label: 'Court',    path: '/images/park-guell/court.jpg',    isPlaceholder: false },
      { id: 'alley',    label: 'Alley',    path: '/images/park-guell/alley.jpg',    isPlaceholder: false },
      { id: 'pillars',  label: 'Pillars',  path: '/images/park-guell/pillars.jpg',  isPlaceholder: false },
    ],
  },
  {
    id: 'mnac-esplanade',
    name: 'MNAC Esplanade',
    neighborhood: 'Montjuïc',
    lat: 41.3716,
    lng: 2.1512,
    type: 'esplanade',
    description: 'The ceremonial axis from Plaça d\'Espanya through Av. Reina Maria Cristina to the Museu Nacional d\'Art de Catalunya.',
    povImages: [
      { id: 'overview',          label: 'Overview',             path: '/images/mnac-esplanade/overview.jpg',                               isPlaceholder: false },
      { id: 'pedestrian',        label: 'Pedestrian',          path: '/images/mnac-esplanade/pedestrian.jpg',                              isPlaceholder: false },
      { id: 'two-towers',        label: 'Two Towers',           path: '/images/mnac-esplanade/two_towers.jpg',                             isPlaceholder: false },
      { id: 'placa-puig',        label: 'Plaça Puig i Cadafalch', path: '/images/mnac-esplanade/Pla\u00E7a de Josep Puig i Cadafalch.jpg', isPlaceholder: false },
    ],
  },
];

/** Derive a human-readable label from a kebab/snake_case filename stem.
 *  'bottom-up' → 'Bottom Up'  |  'street_level' → 'Street Level' */
export function povLabelFromId(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Legacy PoC file — kept for reference only. Use src/data/spaces.ts instead.
interface Hotspot {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  type: string;
  neighborhood: string;
  area: string;
  yearlyWeather: string;
}

export const hotspots: Hotspot[] = [
  {
    id: 'placa-catalunya',
    name: 'Plaça Catalunya',
    description: 'The central square connecting the old city with the Eixample district. Major transport hub and gathering point.',
    lat: 41.3870,
    lng: 2.1700,
    type: 'square',
    neighborhood: 'Eixample / Ciutat Vella',
    area: '50,000 m²',
    yearlyWeather: 'Mediterranean — mild winters (8-12°C), hot summers (25-32°C), 78 days of rain/year',
  },
  {
    id: 'la-rambla',
    name: 'La Rambla',
    description: 'Iconic tree-lined pedestrian boulevard stretching 1.2 km from Plaça Catalunya to the Columbus Monument.',
    lat: 41.3809,
    lng: 2.1734,
    type: 'boulevard',
    neighborhood: 'Ciutat Vella',
    area: '82,000 m² (full length)',
    yearlyWeather: 'Mediterranean — mild winters (8-12°C), hot summers (25-32°C), 78 days of rain/year',
  },
  {
    id: 'passeig-de-gracia',
    name: 'Passeig de Gràcia',
    description: 'Prestigious avenue in the Eixample district, home to Casa Batlló and La Pedrera. Major shopping and architectural corridor.',
    lat: 41.3927,
    lng: 2.1649,
    type: 'boulevard',
    neighborhood: 'Eixample',
    area: '62,000 m² (full length)',
    yearlyWeather: 'Mediterranean — mild winters (8-12°C), hot summers (25-32°C), 78 days of rain/year',
  },
  {
    id: 'barceloneta-beach',
    name: 'Barceloneta Beach',
    description: 'Popular urban beach in the Barceloneta neighborhood, 422m long. Major recreational and social space.',
    lat: 41.3782,
    lng: 2.1925,
    type: 'beach',
    neighborhood: 'Barceloneta',
    area: '42,000 m² (sand area)',
    yearlyWeather: 'Mediterranean — mild winters (10-14°C by coast), hot summers (26-30°C), sea breeze year-round',
  },
  {
    id: 'park-guell',
    name: 'Park Güell Upper Terrace',
    description: 'UNESCO World Heritage site by Antoni Gaudí. Interior elevated terrace within the monumental zone, featuring serpentine bench and panoramic city views.',
    lat: 41.4145,
    lng: 2.1527,
    type: 'park',
    neighborhood: 'Gràcia / El Carmel',
    area: '17,000 m² (monumental zone)',
    yearlyWeather: 'Mediterranean — cooler due to elevation (120m), more wind exposure, excellent ventilation',
  },
];

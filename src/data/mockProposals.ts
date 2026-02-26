import type { Proposal } from '../types';

/* -----------------------------------------------------------------------
   Mock proposals — one per space.
   Used for browse heatmap and generating-screen carousel until Supabase.
   ----------------------------------------------------------------------- */

export const mockProposals: Proposal[] = [
  {
    id: 'mock-001',
    spaceId: 'placa-catalunya',
    povId: 'pedestrian',
    promptText:
      'Add a large interactive water fountain with seating ledges around it, and plant Mediterranean pine trees for shade.',
    language: 'en',
    baseImagePath: '/images/placa-catalunya/pedestrian.jpg',
    generatedImageUrl: '/images/placa-catalunya-generated.jpg',
    agentFeedback: [
      { agentId: 'budget', name: 'Budget', icon: '💰', score: 3,
        feedback: 'Estimated cost: €120,000–€180,000 including fountain infrastructure, stone seating, and mature pine tree transplanting. Comparable to the 2024 Poblenou square renovation.' },
      { agentId: 'heritage', name: 'Heritage', icon: '🏛️', score: 2,
        feedback: 'Plaça Catalunya is a protected cultural site. Any permanent installation requires heritage review. Reversible interventions are significantly easier to approve.' },
      { agentId: 'safety', name: 'Safety', icon: '🛡️', score: 4,
        feedback: 'Water fountain design compliant with EN 15288. Anti-slip surfacing recommended around water zones. Pine trees improve heat mitigation — positive safety impact.' },
      { agentId: 'sociologist', name: 'Sociologist', icon: '👥', score: 5,
        feedback: 'Excellent for social inclusion. Seating ledges benefit elderly and families. Interactive water features increase dwell time and intergenerational interaction.' },
      { agentId: 'regulations', name: 'Regulations', icon: '📋', score: 3,
        feedback: 'Requires municipal permit under Ordenança del Paisatge Urbà. Water infrastructure needs Aigües de Barcelona coordination. Estimated approval: 6–9 months.' },
    ],
    avgAgentScore: 3.4,
    participantName: 'Maria',
    participantAge: 34,
    consentGiven: true,
    status: 'complete',
    createdAt: '2026-01-15T10:30:00Z',
  },
  {
    id: 'mock-002',
    spaceId: 'la-rambla',
    povId: 'pedestrian',
    promptText:
      'Create a dedicated bike lane with green painted surface running along the central pedestrian area, with bike-sharing docking stations every 200m.',
    language: 'en',
    baseImagePath: '/images/la-rambla/pedestrian.jpg',
    generatedImageUrl: '/images/la-rambla-generated.jpg',
    agentFeedback: [
      { agentId: 'budget', name: 'Budget', icon: '💰', score: 4,
        feedback: 'Estimated cost: €85,000–€120,000 for 1.2km painted bike lane and 6 docking stations. Cost-efficient; Bicing integration reduces costs further.' },
      { agentId: 'heritage', name: 'Heritage', icon: '🏛️', score: 3,
        feedback: 'La Rambla is a protected cultural landscape. Surface-level paint markings are reversible and less impactful. Must preserve the historic plane tree canopy.' },
      { agentId: 'safety', name: 'Safety', icon: '🛡️', score: 2,
        feedback: 'Mixing cyclists with 150,000 daily pedestrians presents significant collision risk. Physical separation barriers would be needed at all lateral intersections.' },
      { agentId: 'sociologist', name: 'Sociologist', icon: '👥', score: 3,
        feedback: 'Bike infrastructure supports sustainable mobility. However, may reduce pedestrian comfort in an already crowded space. Street performer livelihoods would be affected.' },
      { agentId: 'regulations', name: 'Regulations', icon: '📋', score: 4,
        feedback: 'Aligns with Barcelona Urban Mobility Plan (PMU 2024-2030). Requires coordination with Districte de Ciutat Vella. Timeline: 3–5 months.' },
    ],
    avgAgentScore: 3.2,
    participantName: 'Jordi',
    participantAge: 28,
    consentGiven: true,
    status: 'complete',
    createdAt: '2026-01-20T14:15:00Z',
  },
  {
    id: 'mock-003',
    spaceId: 'passeig-de-gracia',
    povId: 'pedestrian',
    promptText:
      'Install interactive digital art panels along the boulevard displaying rotating works by local Barcelona artists, illuminated at night.',
    language: 'en',
    baseImagePath: '/images/passeig-de-gracia/pedestrian.jpg',
    generatedImageUrl: '/images/passeig-de-gracia-generated.jpg',
    agentFeedback: [
      { agentId: 'budget', name: 'Budget', icon: '💰', score: 2,
        feedback: 'Estimated cost: €300,000–€450,000 for weather-resistant digital displays and content management system. Annual maintenance ~€40,000. Luxury brand sponsorship potential nearby.' },
      { agentId: 'heritage', name: 'Heritage', icon: '🏛️', score: 2,
        feedback: 'Digital screens may create visual competition with UNESCO-adjacent Modernista buildings. Heritage committee review will be critical and likely restrictive.' },
      { agentId: 'safety', name: 'Safety', icon: '🛡️', score: 4,
        feedback: 'LED panels are low-risk. Night illumination improves pedestrian safety. Anti-glare specifications needed per EU Directive. Panels must not obstruct emergency vehicle access.' },
      { agentId: 'sociologist', name: 'Sociologist', icon: '👥', score: 4,
        feedback: 'Supports local artist visibility and cultural democratization. Night-time activation benefits evening economy. Interactive features engage younger audiences.' },
      { agentId: 'regulations', name: 'Regulations', icon: '📋', score: 3,
        feedback: 'Regulated under Ordenança dels usos del paisatge urbà. Digital displays in Eixample require specific licences. Timeline: 8–12 months.' },
    ],
    avgAgentScore: 3.0,
    participantName: 'Elena',
    participantAge: 42,
    consentGiven: true,
    status: 'complete',
    createdAt: '2026-01-22T09:45:00Z',
  },
  {
    id: 'mock-004',
    spaceId: 'barceloneta-beach',
    povId: 'pedestrian',
    promptText:
      'Build shaded public pavilions from recycled ocean plastic with hammocks and free drinking water stations along the beach promenade.',
    language: 'en',
    baseImagePath: '/images/barceloneta-beach/pedestrian.jpg',
    generatedImageUrl: '/images/barceloneta-generated.jpg',
    agentFeedback: [
      { agentId: 'budget', name: 'Budget', icon: '💰', score: 3,
        feedback: 'Estimated cost: €200,000–€280,000 for 8 pavilions. EU Green Deal co-funding may cover 30-40% through circular economy grants.' },
      { agentId: 'heritage', name: 'Heritage', icon: '🏛️', score: 5,
        feedback: 'Barceloneta beach has no heritage protection for temporary structures. Recycled ocean plastic aligns with Barcelona maritime heritage narrative.' },
      { agentId: 'safety', name: 'Safety', icon: '🛡️', score: 3,
        feedback: 'Structures must withstand Mediterranean storm winds up to 90 km/h. Hammock load testing required. Drinking water must comply with RD 140/2003.' },
      { agentId: 'sociologist', name: 'Sociologist', icon: '👥', score: 5,
        feedback: 'Addresses key citizen demand for beach shade, particularly for elderly and children. Free water stations reduce inequality. Recycled materials tell a positive environmental story.' },
      { agentId: 'regulations', name: 'Regulations', icon: '📋', score: 4,
        feedback: 'Regulated under Pla d\'Usos del Litoral. Semi-permanent structures allowed with seasonal permits. Recycled material certification needed. Timeline: 4–6 months.' },
    ],
    avgAgentScore: 4.0,
    participantName: 'Ahmed',
    participantAge: 25,
    consentGiven: true,
    status: 'complete',
    createdAt: '2026-02-01T16:00:00Z',
  },
  {
    id: 'mock-005',
    spaceId: 'park-guell',
    povId: 'pedestrian',
    promptText:
      'Create a sensory garden with aromatic Mediterranean herbs, tactile sculptures, and audio installations playing nature sounds — fully accessible for visually impaired visitors.',
    language: 'en',
    baseImagePath: '/images/park-guell/pedestrian.jpg',
    generatedImageUrl: '/images/park-guell-generated.jpg',
    agentFeedback: [
      { agentId: 'budget', name: 'Budget', icon: '💰', score: 2,
        feedback: 'Estimated cost: €180,000–€280,000 due to challenging elevated access for materials. Ongoing maintenance for herb gardens: €20,000/year.' },
      { agentId: 'heritage', name: 'Heritage', icon: '🏛️', score: 1,
        feedback: 'Park Güell upper terrace is the UNESCO World Heritage Site centrepiece. Any intervention near Gaudí\'s trencadís mosaics requires UNESCO approval — extremely restricted.' },
      { agentId: 'safety', name: 'Safety', icon: '🛡️', score: 4,
        feedback: 'Elevated terrace requires additional fall protection. Aromatic plants are non-toxic. Audio levels must not interfere with visitor orientation. Wind exposure at 120m elevation a concern.' },
      { agentId: 'sociologist', name: 'Sociologist', icon: '👥', score: 5,
        feedback: 'Outstanding inclusivity proposal. Directly addresses the accessibility gap for visually impaired visitors at one of Barcelona\'s most visited sites.' },
      { agentId: 'regulations', name: 'Regulations', icon: '📋', score: 1,
        feedback: 'UNESCO World Heritage regulations apply. Requires Environmental Impact Assessment and UNESCO, Generalitat, and municipal coordination. Timeline: 24–36 months minimum.' },
    ],
    avgAgentScore: 2.6,
    participantName: 'Clara',
    participantAge: 56,
    consentGiven: true,
    status: 'complete',
    createdAt: '2026-02-05T11:20:00Z',
  },
];

/** Get proposals for a given space */
export function getProposalsForSpace(spaceId: string): Proposal[] {
  return mockProposals.filter((p) => p.spaceId === spaceId);
}

/** Get the mock generated image URL for a space */
export function getMockGeneratedImageForSpace(spaceId: string): string {
  return mockProposals.find((p) => p.spaceId === spaceId)?.generatedImageUrl
    ?? '/images/placa-catalunya-generated.jpg';
}

/** Get mock agent feedback for a space */
export function getMockAgentFeedbackForSpace(spaceId: string) {
  return mockProposals.find((p) => p.spaceId === spaceId)?.agentFeedback
    ?? mockProposals[0].agentFeedback;
}

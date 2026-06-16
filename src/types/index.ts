/* ---- Types for Barcelona Civic Vision ---- */

// ── Spaces & POVs ─────────────────────────────────────────────────────────────

export interface SpacePOV {
  id: string;          // filename stem (kebab-case), e.g. 'pedestrian', 'bottom-up'
  label: string;       // human-readable display label
  path: string;        // absolute path from /public
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

// ── Proposals & Agents ────────────────────────────────────────────────────────

export interface AgentFeedback {
  agentId: string;
  name: string;
  icon: string;
  score: number; // 1 to 5
  feedback: string;
  risks?: string[];
  recommendations?: string[];
  references?: string[];
}

export type ParticipantGender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
export type PromptSource = 'original' | 'expert_suggested';
export type ProposalStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface Proposal {
  id: string;
  spaceId: string;              // references Space.id
  povId: string;                // references SpacePOV.id
  promptText: string;
  language: 'en' | 'ca' | 'es';
  baseImagePath: string;        // local /public path used as generation input
  generatedImageUrl: string;    // Supabase Storage URL (empty while pending)
  agentFeedback: AgentFeedback[];
  avgAgentScore: number;        // cached average for heatmap weighting
  communityScore?: number;      // average public vote score, 0 when not voted yet
  voteCount?: number;           // number of community votes
  participantName?: string;
  participantAge?: number;
  participantGender?: ParticipantGender;
  hasChildren?: boolean;
  hasPets?: boolean;
  hasRestrictedMobility?: boolean;
  consentGiven: boolean;
  status: ProposalStatus;
  createdAt: string;
  originalPromptText?: string;
  expertSuggestedPrompt?: string;
  promptSource?: PromptSource;
  isDraft?: boolean;
}

// ── Application State ─────────────────────────────────────────────────────────

/** Current high-level mode of the application */
export type AppMode = 'browse' | 'suggest';

/** Steps in the suggest flow (1-indexed for display) */
export type FlowStep = 1 | 2 | 3 | 4 | 5 | 6;
// 1: Choose Space  2: Choose POV  3: Write prompt  4: Confirm + consent
// 5: Generating    6: Results

export interface SuggestFlowState {
  step: FlowStep;
  selectedSpaceId: string | null;
  selectedPovId: string | null;
  promptText: string;
  originalPromptText: string;
  participantName: string;
  participantAge: string;   // string while in input, parsed to number on submit
  participantGender: ParticipantGender | '';
  hasChildren: boolean | null;
  hasPets: boolean | null;
  hasRestrictedMobility: boolean | null;
  consentGiven: boolean;
  currentProposal: Proposal | null;
  promptRejectionReason: string | null; // set when the AI validator rejects a prompt
}

export interface AppState {
  // ── Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // ── Browse mode
  browseSpaceId: string | null;
  setBrowseSpaceId: (spaceId: string | null) => void;
  browseProposal: Proposal | null;
  setBrowseProposal: (proposal: Proposal | null) => void;

  // ── Suggest flow
  flow: SuggestFlowState;
  setFlowStep: (step: FlowStep) => void;
  setSelectedSpace: (spaceId: string | null) => void;
  setSelectedPov: (povId: string | null) => void;
  setPromptText: (text: string) => void;
  setOriginalPromptText: (text: string) => void;
  setParticipantName: (name: string) => void;
  setParticipantAge: (age: string) => void;
  setParticipantGender: (gender: ParticipantGender | '') => void;
  setHasChildren: (value: boolean | null) => void;
  setHasPets: (value: boolean | null) => void;
  setHasRestrictedMobility: (value: boolean | null) => void;
  setConsentGiven: (given: boolean) => void;
  setCurrentProposal: (proposal: Proposal | null) => void;
  setPromptRejectionReason: (reason: string | null) => void;
  resetFlow: () => void;

  // ── Map
  mapResetTrigger: number;
  triggerMapReset: () => void;

  // ── Evaluation
  isEvaluating: boolean;
  evaluationError: string | null;
  setIsEvaluating: (loading: boolean) => void;
  setEvaluationError: (error: string | null) => void;
}

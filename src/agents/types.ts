/**
 * Agent skill type definitions.
 *
 * Each agent is a stateless, testable function with a standard interface.
 * Agents are composed by the conversation state machine.
 */

export interface AgentSkill<TInput, TOutput> {
  name: string;
  description: string;
  execute: (input: TInput) => Promise<TOutput>;
}

/** Shared context passed to agents that need location awareness. */
export interface AgentContext {
  hotspotId?: string;
  locationName?: string;
  locationDescription?: string;
  baseImageUrl?: string;
}

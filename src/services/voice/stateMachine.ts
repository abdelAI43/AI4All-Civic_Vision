import type { FlowStep } from '../../types';

export type VoiceFlowState =
  | 'inactive'
  | 'step1_greeting'
  | 'step2_pov'
  | 'step3_prompt'
  | 'step4_confirm'
  | 'step5_generating'
  | 'step6_results';

export function toVoiceFlowState(step: FlowStep, isActive: boolean): VoiceFlowState {
  if (!isActive) return 'inactive';
  if (step === 1) return 'step1_greeting';
  if (step === 2) return 'step2_pov';
  if (step === 3) return 'step3_prompt';
  if (step === 4) return 'step4_confirm';
  if (step === 5) return 'step5_generating';
  return 'step6_results';
}

export function shouldCollapseTranscript(step: FlowStep): boolean {
  return step >= 5;
}

export function shouldAutoAdvanceFromSelection(step: FlowStep): boolean {
  return step === 1 || step === 2;
}

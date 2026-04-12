import { useState } from 'react';
import './PromptInput.css';
import { spaces } from '../../data/spaces';
import { useAppStore } from '../../store/useAppStore';
import { evaluateProposal } from '../../services/api';

/**
 * Legacy prompt input kept type-safe with the current app store shape.
 * The main suggest flow now uses the guided modal pipeline instead.
 */
export function PromptInput() {
  const [value, setValue] = useState('');

  const flow = useAppStore((s) => s.flow);
  const isEvaluating = useAppStore((s) => s.isEvaluating);
  const evaluationError = useAppStore((s) => s.evaluationError);
  const setIsEvaluating = useAppStore((s) => s.setIsEvaluating);
  const setEvaluationError = useAppStore((s) => s.setEvaluationError);
  const setCurrentProposal = useAppStore((s) => s.setCurrentProposal);
  const setFlowStep = useAppStore((s) => s.setFlowStep);

  const selectedSpace = spaces.find((space) => space.id === flow.selectedSpaceId);
  const selectedPov = selectedSpace?.povImages.find((pov) => pov.id === flow.selectedPovId)
    ?? selectedSpace?.povImages[0];

  const handleSubmit = async () => {
    if (!value.trim() || !selectedSpace || isEvaluating) return;

    setIsEvaluating(true);
    setEvaluationError(null);

    try {
      const location = `${selectedSpace.name}, ${selectedSpace.neighborhood}`;
      const agents = await evaluateProposal(value, location, selectedSpace.id);
      const avgAgentScore = agents.length
        ? agents.reduce((sum, agent) => sum + agent.score, 0) / agents.length
        : 0;

      setCurrentProposal({
        id: `live-${Date.now()}`,
        spaceId: selectedSpace.id,
        povId: selectedPov?.id ?? 'unknown',
        promptText: value,
        language: 'en',
        baseImagePath: selectedPov?.path ?? '',
        generatedImageUrl: '',
        agentFeedback: agents,
        avgAgentScore,
        participantName: 'You',
        consentGiven: true,
        status: 'complete',
        createdAt: new Date().toISOString(),
      });
      setFlowStep(6);
      setValue('');
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="prompt-input-wrapper">
      <label className="prompt-input-label">
        Suggest a change
        <span className="voice-hint">Voice-guided flow available in the modal</span>
      </label>
      <div className="prompt-input-row">
        <input
          type="text"
          className="prompt-input"
          placeholder="Describe the change you would like to see..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={isEvaluating}
        />
        <button
          className="prompt-submit"
          onClick={handleSubmit}
          disabled={!value.trim() || !selectedSpace || isEvaluating}
        >
          {isEvaluating ? 'Evaluating...' : 'Submit'}
        </button>
      </div>
      {isEvaluating && (
        <div className="prompt-toast">
          Running 5 agent evaluations - this may take a moment...
        </div>
      )}
      {evaluationError && (
        <div className="prompt-toast" style={{ color: '#b33' }}>
          {evaluationError}
        </div>
      )}
    </div>
  );
}
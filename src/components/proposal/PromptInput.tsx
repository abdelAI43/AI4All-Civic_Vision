import { useState } from 'react';
import './PromptInput.css';
import { useAppStore } from '../../store/useAppStore';
import { evaluateProposal } from '../../services/api';

/**
 * Prompt input — submits proposal to the backend for live agent evaluation.
 */
export function PromptInput() {
  const [value, setValue] = useState('');

  const selectedHotspot = useAppStore((s) => s.selectedHotspot);
  const isEvaluating = useAppStore((s) => s.isEvaluating);
  const evaluationError = useAppStore((s) => s.evaluationError);
  const setIsEvaluating = useAppStore((s) => s.setIsEvaluating);
  const setEvaluationError = useAppStore((s) => s.setEvaluationError);
  const setSelectedProposal = useAppStore((s) => s.setSelectedProposal);

  const handleSubmit = async () => {
    if (!value.trim() || !selectedHotspot || isEvaluating) return;

    setIsEvaluating(true);
    setEvaluationError(null);

    try {
      const location = `${selectedHotspot.name}, ${selectedHotspot.neighborhood}`;
      const agents = await evaluateProposal(value, location, selectedHotspot.id);

      setSelectedProposal({
        id: `live-${Date.now()}`,
        hotspotId: selectedHotspot.id,
        userName: 'You',
        userAge: 0,
        prompt: value,
        originalImage: '',
        generatedImage: '',
        agentFeedback: agents,
        createdAt: new Date().toISOString(),
      });
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
        <span className="voice-hint">🎤 Voice input coming soon</span>
      </label>
      <div className="prompt-input-row">
        <input
          type="text"
          className="prompt-input"
          placeholder="Describe the change you'd like to see…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={isEvaluating}
        />
        <button
          className="prompt-submit"
          onClick={handleSubmit}
          disabled={!value.trim() || !selectedHotspot || isEvaluating}
        >
          {isEvaluating ? 'Evaluating…' : 'Submit'}
        </button>
      </div>
      {isEvaluating && (
        <div className="prompt-toast">
          ⏳ Running 5 agent evaluations — this may take a moment…
        </div>
      )}
      {evaluationError && (
        <div className="prompt-toast" style={{ color: '#b33' }}>
          ✗ {evaluationError}
        </div>
      )}
    </div>
  );
}

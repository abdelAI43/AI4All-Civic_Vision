/**
 * VoiceOverlay — full-screen voice interaction layer.
 *
 * This is the main exhibition UI. It shows:
 * - Current conversation stage with visual indicator
 * - Waveform when listening
 * - Pulsing indicator when AI is thinking/speaking
 * - Conversation message bubbles
 * - Generated image result
 */

import { useConversation } from '../../hooks/useConversation';
import { WaveformVisualizer } from './WaveformVisualizer';
import { ConversationBubbles } from './ConversationBubbles';
import { StageIndicator } from './StageIndicator';
import './VoiceOverlay.css';

export function VoiceOverlay() {
  const {
    isActive,
    stage,
    activity,
    messages,
    context,
    volumeLevel,
    error,
    startConversation,
    stopConversation,
  } = useConversation();

  // Not active — show start button
  if (!isActive) {
    return (
      <div className="voice-start-screen">
        <div className="voice-start-content">
          <h1 className="voice-start-title">Barcelona Civic Vision</h1>
          <p className="voice-start-subtitle">
            Speak your vision for the city
          </p>
          <button
            className="voice-start-button"
            onClick={startConversation}
            type="button"
          >
            <span className="voice-start-icon">🎤</span>
            <span>Start Experience</span>
          </button>
        </div>
      </div>
    );
  }

  // Active — show conversation overlay
  return (
    <div className="voice-overlay" data-stage={stage} data-activity={activity}>
      {/* Stage progress indicator */}
      <StageIndicator stage={stage} />

      {/* Background hotspot image when area is selected */}
      {context.selectedHotspot && (
        <div
          className="voice-overlay-bg"
          style={{
            backgroundImage: `url(/images/${context.selectedHotspot.id}-original.jpg)`,
          }}
        />
      )}

      {/* Generated image result */}
      {stage === 'result' && context.generatedImageUrl && (
        <div className="voice-result-panel">
          <div className="voice-result-images">
            <div className="voice-result-image">
              <img
                src={`/images/${context.selectedHotspot?.id}-original.jpg`}
                alt="Before"
              />
              <span className="voice-result-label">Before</span>
            </div>
            <div className="voice-result-image">
              <img
                src={context.generatedImageUrl}
                alt="Your proposal"
              />
              <span className="voice-result-label">Your Vision</span>
            </div>
          </div>
        </div>
      )}

      {/* Conversation messages */}
      <div className="voice-messages-container">
        <ConversationBubbles messages={messages} />
      </div>

      {/* Activity indicator */}
      <div className="voice-activity-area">
        {activity === 'listening' && (
          <WaveformVisualizer volumeLevel={volumeLevel} />
        )}

        {activity === 'transcribing' && (
          <div className="voice-status-indicator">
            <div className="voice-pulse transcribing" />
            <span>Processing your voice...</span>
          </div>
        )}

        {activity === 'thinking' && (
          <div className="voice-status-indicator">
            <div className="voice-pulse thinking" />
            <span>Thinking...</span>
          </div>
        )}

        {activity === 'speaking' && (
          <div className="voice-status-indicator">
            <div className="voice-pulse speaking" />
            <span>Speaking...</span>
          </div>
        )}

        {activity === 'generating_image' && (
          <div className="voice-status-indicator">
            <div className="voice-pulse generating" />
            <span>Creating your vision...</span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="voice-error">
          <p>{error}</p>
          <button onClick={startConversation} type="button">
            Try Again
          </button>
        </div>
      )}

      {/* Close button */}
      <button
        className="voice-close-button"
        onClick={stopConversation}
        type="button"
        aria-label="Close voice interaction"
      >
        ✕
      </button>
    </div>
  );
}

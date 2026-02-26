/**
 * ConversationBubbles — displays chat-like message history.
 * AI messages on the left, user messages on the right.
 */

import { useEffect, useRef } from 'react';
import type { ConversationMessage } from '../../services/conversation/types';
import './ConversationBubbles.css';

interface Props {
  messages: ConversationMessage[];
}

export function ConversationBubbles({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="conversation-bubbles">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`bubble bubble-${msg.role}`}
        >
          <span className="bubble-role">{msg.role === 'ai' ? '🤖' : '🎤'}</span>
          <p className="bubble-text">{msg.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

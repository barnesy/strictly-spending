import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../chatStore';
import type { ChatMessage } from '../../ai';
import { CopilotOrchestrator } from '../../ai/CopilotOrchestrator';

export function useCopilotActionHandler() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendPromptText = async (textToSubmit: string) => {
    if (!textToSubmit.trim() || loading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const userMsg: ChatMessage = { role: 'user', content: textToSubmit.trim() };
    useChatStore.getState().addMessage(userMsg);
    setLoading(true);

    try {
      await CopilotOrchestrator.run(userMsg, {
        navigate,
        location,
        signal
      });
    } catch (e: any) {
      if (e.name !== 'AbortError' && !e.message?.includes('aborted')) {
        console.error('Copilot Execution Error:', e);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stopPromptExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  return { sendPromptText, stopPromptExecution, loading };
}

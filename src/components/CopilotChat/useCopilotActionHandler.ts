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

  const sendPromptText = async (text: string, images?: string[], attachedFile?: { filename: string, localPath?: string, base64?: string, text?: string, type: 'image' | 'pdf' }) => {
    if ((!text.trim() && !images && !attachedFile) || loading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), images, attachedFile };
    useChatStore.getState().addMessage(userMsg);
    setLoading(true);

    try {
      await CopilotOrchestrator.run(userMsg, {
        navigate,
        location,
        signal
      });
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('AbortError')) {
        useChatStore.getState().finalizeStreamingMessage('', null, undefined, undefined, undefined, undefined, undefined, true, undefined);
      } else {
        console.error('Copilot Execution Error:', e);
        useChatStore.getState().finalizeStreamingMessage('', null, undefined, undefined, undefined, undefined, undefined, false, e.message || 'An error occurred during execution.');
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

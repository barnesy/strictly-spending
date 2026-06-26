import { api } from './api';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localAI, type ChatMessage } from './ai';

import type { WorkspaceConfig, ChatArtifact, ChatThread } from './types';

let cachedTauriInvoke: any = null;
async function getTauriInvoke() {
  if (!cachedTauriInvoke) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedTauriInvoke = invoke;
  }
  return cachedTauriInvoke;
}

export function formatModelName(name: string): string {
  if (!name) return 'AI';
  let label = name;
  if (name === 'gemma2:2b') label = 'Gemma 2 2B';
  else if (name === 'gemma2:9b') label = 'Gemma 2 9B';
  else if (name === 'gemma2:27b') label = 'Gemma 2 27B';
  else if (name === 'llama3.2:1b') label = 'Llama 3.2 1B';
  else if (name === 'llama3.2:3b') label = 'Llama 3.2 3B';
  else if (name === 'mistral:latest') label = 'Mistral 7B';
  else {
    const parts = name.split(':');
    const base = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    label = parts[1] ? `${base} (${parts[1]})` : base;
  }
  return label;
}

export type AIStatus = 'checking' | 'uninstalled' | 'stopped' | 'running' | 'pulling' | 'ready' | 'error' | 'safemode';

interface ChatStore {
  messages: ChatMessage[];
  aiLoaded: boolean;
  aiStatus: AIStatus;
  aiProgress: string;
  aiProgressPercent: number;
  modelName: string;
  setModelName: (name: string) => void;
  addMessage: (msg: ChatMessage) => void;
  startStreamingMessage: (initialSteps?: string[], purpose?: 'tool_select' | 'explanation', resumeLastMessage?: boolean) => void;
  appendStreamingToken: (token: string) => void;
  updateStreamingMetadata: (steps: string[], tokenUsage?: { prompt: number; completion: number; total: number }) => void;
  finalizeStreamingMessage: (finalContent: string, actionResult?: any, steps?: string[], tokenUsage?: { prompt: number; completion: number; total: number }, purpose?: 'tool_select' | 'explanation', activeSkillId?: string, completedStages?: string[]) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  checkAIStatus: (force?: boolean) => Promise<void>;
  installOllama: () => Promise<void>;
  startOllama: () => Promise<void>;
  pullModel: () => Promise<void>;
  cancelPullModel: () => void;
  initializeAI: () => Promise<void>;
  activeThreadId: string | null;
  threads: ChatThread[];
  setActiveThreadId: (id: string | null) => void;
  loadThreads: () => Promise<void>;
  createThread: (title?: string) => Promise<string>;
  deleteThread: (id: string) => Promise<void>;
  loadThreadMessages: (threadId: string) => Promise<void>;
  activeWorkspaceId: string;
  savedWorkspaces: WorkspaceConfig[];
  setActiveWorkspaceId: (id: string) => void;
  loadSavedWorkspaces: () => Promise<void>;
  saveWorkspace: (w: WorkspaceConfig) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  activeArtifact: ChatArtifact | null;
  setActiveArtifact: (art: ChatArtifact | null) => void;
  lastDebugPayload: string;
  setLastDebugPayload: (payload: string) => void;
  agentSkills: any[];
  loadAgentSkills: () => Promise<void>;
  directLlmMode: boolean;
  setDirectLlmMode: (enabled: boolean) => void;
  deleteModel: (name: string) => Promise<void>;
}

let lastStatusCheckTime = 0;

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      aiLoaded: false,
      aiStatus: 'checking',
      aiProgress: '',
      aiProgressPercent: 0,
      modelName: localAI.modelName,
      agentSkills: [],
      directLlmMode: false,

      setDirectLlmMode: (enabled: boolean) => set({ directLlmMode: enabled }),

      deleteModel: async (name: string) => {
        try {
          const response = await fetch('http://localhost:11434/api/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          if (!response.ok) {
            throw new Error(`Failed to delete model: ${response.statusText}`);
          }
          
          // If we deleted the active model, fallback to another model or default
          if (get().modelName === name) {
            try {
              const res = await fetch('http://localhost:11434/api/tags');
              if (res.ok) {
                const data = await res.json();
                const remaining = data.models || [];
                const nextModel = remaining.find((m: any) => m.name !== name);
                if (nextModel) {
                  get().setModelName(nextModel.name);
                } else {
                  get().setModelName('gemma2:2b');
                }
              }
            } catch {
              get().setModelName('gemma2:2b');
            }
          }
          
          await get().checkAIStatus(true);
        } catch (err: any) {
          console.error('Failed to delete model:', err);
          throw err;
        }
      },

      loadAgentSkills: async () => {
        try {
          const skills = await api.getSetting<any[]>('app:agentSkills') || [];
          set({ agentSkills: skills });
        } catch (e) {
          console.error('Failed to load agent skills', e);
        }
      },

      setModelName: (name: string) => {
        localAI.setModelName(name);
        set({ modelName: name });
        get().checkAIStatus();
      },

      addMessage: async (msg) => {
        set((state) => ({ messages: [...state.messages, msg] }));
        const threadId = get().activeThreadId;
        if (threadId) {
          await api.putMessage({
            threadId,
            role: msg.role,
            content: msg.content,
            actionResult: msg.actionResult,
            createdAt: new Date().toISOString()
          });

          const thread = get().threads.find(t => t.id === threadId);
          if (thread && thread.title === 'New Chat' && msg.role === 'user') {
            const firstLine = msg.content.trim().split('\n')[0];
            const newTitle = firstLine.length > 25 ? firstLine.slice(0, 25) + '...' : firstLine;
            await api.putThread({
              ...thread,
              title: newTitle,
              updatedAt: new Date().toISOString()
            });
            await get().loadThreads();
          } else {
            if (thread) {
              await api.putThread({
                ...thread,
                updatedAt: new Date().toISOString()
              });
              await get().loadThreads();
            }
          }
        }
      },

      startStreamingMessage: (initialSteps, purpose, resumeLastMessage) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && (lastMsg.isStreaming || resumeLastMessage)) {
            const updated = [...state.messages];
            updated[updated.length - 1] = {
              ...lastMsg,
              content: resumeLastMessage ? '' : lastMsg.content,
              isStreaming: true,
              steps: initialSteps || [],
              purpose: purpose || lastMsg.purpose
            };
            return { messages: updated };
          }
          return {
            messages: [...state.messages, { role: 'assistant', content: '', isStreaming: true, steps: initialSteps || [], purpose }]
          };
        });
      },

      appendStreamingToken: (token) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...state.messages];
            updated[updated.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + token
            };
            return { messages: updated };
          }
          return {};
        });
      },

      updateStreamingMetadata: (steps, tokenUsage) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...state.messages];
            updated[updated.length - 1] = {
              ...lastMsg,
              steps,
              tokenUsage: tokenUsage || lastMsg.tokenUsage
            };
            return { messages: updated };
          }
          return {};
        });
      },

      finalizeStreamingMessage: async (finalContent, actionResult, steps, tokenUsage, purpose, activeSkillId, completedStages) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const updated = [...state.messages];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: finalContent,
              actionResult: actionResult !== undefined && actionResult !== null ? actionResult : lastMsg.actionResult,
              steps: steps || lastMsg.steps,
              tokenUsage: tokenUsage || lastMsg.tokenUsage,
              purpose: purpose || lastMsg.purpose,
              activeSkillId: activeSkillId !== undefined ? activeSkillId : lastMsg.activeSkillId,
              completedStages: completedStages !== undefined ? completedStages : lastMsg.completedStages
            };
            return { messages: updated };
          }
          return {};
        });

        const threadId = get().activeThreadId;
        if (threadId) {
          const lastMsg = get().messages[get().messages.length - 1];
          await api.putMessage({
            threadId,
            role: 'assistant',
            content: finalContent,
            actionResult: actionResult !== undefined && actionResult !== null ? actionResult : lastMsg?.actionResult,
            steps: steps || lastMsg?.steps,
            tokenUsage: tokenUsage || lastMsg?.tokenUsage,
            purpose: purpose || lastMsg?.purpose,
            activeSkillId,
            completedStages,
            createdAt: new Date().toISOString()
          });

          const thread = get().threads.find(t => t.id === threadId);
          if (thread) {
            await api.putThread({
              ...thread,
              updatedAt: new Date().toISOString()
            });
            await get().loadThreads();
          }
        }
      },
      setMessages: (messages) => set({ messages }),
      clearMessages: async () => {
        const threadId = get().activeThreadId;
        if (threadId) {
          await api.deleteThreadMessages(threadId);
        }
        set({ messages: [] });
      },

      checkAIStatus: async (force) => {
        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

        // Skip background checks if a model is currently downloading
        if (get().aiStatus === 'pulling' && !force) {
          console.log('[checkAIStatus] Skipped status check because pulling is active.');
          return;
        }

        // Cooldown/Throttle check: prevent calling more than once every 2 seconds unless forced
        const now = Date.now();
        if (!force && (now - lastStatusCheckTime < 2000)) {
          console.log('[checkAIStatus] Throttled to prevent rapid render loop.');
          return;
        }
        lastStatusCheckTime = now;

        // Otherwise check Ollama status
        set({ aiStatus: 'checking', aiProgress: 'Checking Ollama status...' });
        try {
          if (isTauri) {
            const invoke = await getTauriInvoke();
            
            // Check if application is running in Safe Mode
            let safeMode = false;
            if (!force) {
              try {
                safeMode = await invoke('is_safe_mode');
              } catch (e) {
                console.error('Failed to check safe mode status:', e);
              }
            }

            if (safeMode) {
              set({ aiStatus: 'safemode', aiProgress: 'Safe Mode Active. Automatic checks disabled for stability.', aiLoaded: false, aiProgressPercent: 0 });
              return;
            }

            const status: { installed: boolean; running: boolean } = await invoke('check_ollama_status');
            
            if (status.running) {
              try {
                await localAI.init();
                set({ aiStatus: 'ready', aiProgress: 'AI Ready', aiLoaded: true, aiProgressPercent: 100 });
              } catch (e: any) {
                if (e.message.includes('is not installed')) {
                  set({ aiStatus: 'running', aiProgress: 'Model needs download', aiLoaded: false, aiProgressPercent: 0 });
                } else {
                  set({ aiStatus: 'error', aiProgress: e.message, aiLoaded: false });
                }
              }
            } else if (status.installed) {
              set({ aiStatus: 'stopped', aiProgress: 'Ollama is installed but not running.', aiLoaded: false });
            } else {
              set({ aiStatus: 'uninstalled', aiProgress: 'Ollama is not installed.', aiLoaded: false });
            }
          } else {
            // Web browser connection ping
            try {
              await localAI.init();
              set({ aiStatus: 'ready', aiProgress: 'AI Ready', aiLoaded: true, aiProgressPercent: 100 });
            } catch (e: any) {
              if (e.message.includes('is not installed')) {
                set({ aiStatus: 'running', aiProgress: 'Model needs download', aiLoaded: false, aiProgressPercent: 0 });
              } else {
                set({ aiStatus: 'stopped', aiProgress: 'Cannot connect to Ollama. Make sure it is running on http://localhost:11434.', aiLoaded: false });
              }
            }
          }
        } catch (err: any) {
          set({ aiStatus: 'error', aiProgress: `Status check failed: ${err.message}`, aiLoaded: false });
        }
      },

      installOllama: async () => {
        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
        if (!isTauri) return;
        
        set({ aiStatus: 'checking', aiProgress: 'Downloading & unzipping Ollama.app to App Support... (takes 10-30s)', aiProgressPercent: 30 });
        try {
          const invoke = await getTauriInvoke();
          await invoke('install_ollama');
          set({ aiProgress: 'Starting Ollama service...', aiProgressPercent: 80 });
          await invoke('start_ollama');
          
          // Poll status check until online
          for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const status: { running: boolean } = await invoke('check_ollama_status');
            if (status.running) break;
          }
          
          await get().checkAIStatus();
        } catch (err: any) {
          set({ aiStatus: 'error', aiProgress: `Ollama installation failed: ${err}` });
        }
      },

      startOllama: async () => {
        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
        if (!isTauri) return;
        
        set({ aiStatus: 'checking', aiProgress: 'Starting Ollama background process...', aiProgressPercent: 50 });
        try {
          const invoke = await getTauriInvoke();
          await invoke('start_ollama');
          
          for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const status: { running: boolean } = await invoke('check_ollama_status');
            if (status.running) break;
          }
          
          await get().checkAIStatus();
        } catch (err: any) {
          set({ aiStatus: 'error', aiProgress: `Failed to launch Ollama.app: ${err}` });
        }
      },

      pullModel: async () => {
        set({ aiStatus: 'pulling', aiProgress: 'Requesting model download...', aiProgressPercent: 0 });
        try {
          await localAI.pullModel((pct, statusText) => {
            set({
              aiProgressPercent: pct,
              aiProgress: `${statusText} (${pct}%)`
            });
          });
          // Check if it was aborted
          if (localAI.isLoaded) {
            set({ aiStatus: 'ready', aiProgress: 'AI Ready', aiLoaded: true, aiProgressPercent: 100 });
          } else {
            // Aborted or check again
            get().checkAIStatus();
          }
        } catch (err: any) {
          set({ aiStatus: 'error', aiProgress: `Model download failed: ${err.message}`, aiProgressPercent: 0 });
        }
      },

      cancelPullModel: () => {
        localAI.abortPull?.();
        set({ aiStatus: 'stopped', aiProgress: 'Download cancelled.', aiLoaded: false, aiProgressPercent: 0 });
        get().checkAIStatus();
      },

      initializeAI: async () => {
        await get().checkAIStatus();
        const status = get().aiStatus;

        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
        if (status === 'uninstalled' && isTauri) {
          await get().installOllama();
        } else if (status === 'stopped' && isTauri) {
          await get().startOllama();
        } else if (status === 'running') {
          await get().pullModel();
        } else if (status === 'ready') {
          // Already ready
        }
      },

      activeWorkspaceId: 'tpl-budget-audit',
      savedWorkspaces: [],
      setActiveWorkspaceId: (id: string) => set({ activeWorkspaceId: id }),
      loadSavedWorkspaces: async () => {
        const list = await api.getSetting<WorkspaceConfig[]>('app:workspaces') || [];
        set({ savedWorkspaces: list });
      },
      saveWorkspace: async (updatedWorkspace: WorkspaceConfig) => {
        const isTemplate = ['tpl-budget-audit', 'tpl-sub-check', 'tpl-groceries-plan'].includes(updatedWorkspace.id);
        const workspaceToSave = isTemplate ? { ...updatedWorkspace, id: `user-${Date.now()}` } : updatedWorkspace;

        const currentSaved = get().savedWorkspaces;
        const filtered = currentSaved.filter((w) => w.id !== workspaceToSave.id);
        const nextList = [...filtered, workspaceToSave];

        await api.putSetting('app:workspaces', nextList);
        set({ savedWorkspaces: nextList });
        if (isTemplate) {
          set({ activeWorkspaceId: workspaceToSave.id });
        }
      },
      deleteWorkspace: async (id: string) => {
        const currentSaved = get().savedWorkspaces;
        const nextList = currentSaved.filter((w) => w.id !== id);
        await api.putSetting('app:workspaces', nextList);
        set({ savedWorkspaces: nextList });
        if (get().activeWorkspaceId === id) {
          set({ activeWorkspaceId: 'tpl-budget-audit' });
        }
      },
      activeArtifact: null,
      setActiveArtifact: (art) => set({ activeArtifact: art }),
      lastDebugPayload: '',
      setLastDebugPayload: (payload) => set({ lastDebugPayload: payload }),
      
      activeThreadId: null,
      threads: [],

      setActiveThreadId: (id) => {
        set({ activeThreadId: id });
        if (id) {
          get().loadThreadMessages(id);
        } else {
          set({ messages: [] });
        }
      },

      loadThreads: async () => {
        const list = await api.getThreads();
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        set({ threads: list });
        const activeId = get().activeThreadId;
        if (activeId && get().messages.length === 0) {
          get().loadThreadMessages(activeId);
        }
      },

      createThread: async (title) => {
        const id = `thread-${Date.now()}`;
        const newThread = {
          id,
          title: title || 'New Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await api.putThread(newThread);
        const currentThreads = get().threads;
        set({ threads: [newThread, ...currentThreads], activeThreadId: id, messages: [] });
        return id;
      },

      deleteThread: async (id) => {
        await api.deleteThread(id);
        await api.deleteThreadMessages(id);
        const nextThreads = get().threads.filter(t => t.id !== id);
        set({ threads: nextThreads });
        if (get().activeThreadId === id) {
          if (nextThreads.length > 0) {
            get().setActiveThreadId(nextThreads[0].id);
          } else {
            set({ activeThreadId: null, messages: [] });
          }
        }
      },

      loadThreadMessages: async (threadId) => {
        const allMessages = await api.getMessages();
        const list = allMessages.filter(m => m.threadId === threadId);
        list.sort((a, b) => (a.id || 0) - (b.id || 0));

        const formatted = await Promise.all(list.map(async (m) => {
          const actionResult = m.actionResult as any;
          if (actionResult?.metrics?.transactions) {
            delete actionResult.metrics.transactions;
            await api.putMessage(m);
          }
          return {
            role: m.role,
            content: m.content,
            actionResult: m.actionResult,
            steps: m.steps,
            tokenUsage: m.tokenUsage,
            purpose: m.purpose,
            activeSkillId: m.activeSkillId,
            completedStages: m.completedStages
          };
        }));
        set({ messages: formatted });
      }
    }),
    {
      name: 'spending-viz:chat',
      partialize: (state) => ({
        activeThreadId: state.activeThreadId,
        directLlmMode: state.directLlmMode,
      }),
    }
  )
);

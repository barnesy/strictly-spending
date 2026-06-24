import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq, desc, asc } from 'drizzle-orm';
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
  if (name === 'llama3.2:1b') label = 'Llama 3.2 1B';
  else if (name === 'llama3.2:3b') label = 'Llama 3.2 3B';
  else if (name === 'gemma2:2b') label = 'Gemma 2 2B';
  else if (name === 'mistral:latest') label = 'Mistral 7B';
  else {
    const parts = name.split(':');
    const base = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    label = parts[1] ? `${base} (${parts[1]})` : base;
  }
  return label;
}

export type AIStatus = 'checking' | 'uninstalled' | 'stopped' | 'running' | 'pulling' | 'ready' | 'error';

interface ChatStore {
  messages: ChatMessage[];
  aiLoaded: boolean;
  aiStatus: AIStatus;
  aiProgress: string;
  aiProgressPercent: number;
  modelName: string;
  setModelName: (name: string) => void;
  addMessage: (msg: ChatMessage) => void;
  startStreamingMessage: (initialSteps?: string[], purpose?: 'tool_select' | 'explanation') => void;
  appendStreamingToken: (token: string) => void;
  updateStreamingMetadata: (steps: string[], tokenUsage?: { prompt: number; completion: number; total: number }) => void;
  finalizeStreamingMessage: (finalContent: string, actionResult?: any, steps?: string[], tokenUsage?: { prompt: number; completion: number; total: number }, purpose?: 'tool_select' | 'explanation', activeSkillId?: string, completedStages?: string[]) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  checkAIStatus: () => Promise<void>;
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
}

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

      loadAgentSkills: async () => {
        try {
          const res = await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:agentSkills'));
          const skills = res[0]?.value as any[] || [];
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
          await db.insert(schema.messages).values({
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
            await db.update(schema.threads)
              .set({ title: newTitle, updatedAt: new Date().toISOString() })
              .where(eq(schema.threads.id, threadId));
            await get().loadThreads();
          } else {
            await db.update(schema.threads)
              .set({ updatedAt: new Date().toISOString() })
              .where(eq(schema.threads.id, threadId));
          }
        }
      },

      startStreamingMessage: (initialSteps, purpose) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
            const updated = [...state.messages];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: '',
              isStreaming: true,
              steps: initialSteps || [],
              purpose
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
              actionResult,
              steps: steps || lastMsg.steps,
              tokenUsage: tokenUsage || lastMsg.tokenUsage,
              purpose: purpose || lastMsg.purpose,
              activeSkillId,
              completedStages
            };
            return { messages: updated };
          }
          return {};
        });

        const threadId = get().activeThreadId;
        if (threadId) {
          const lastMsg = get().messages[get().messages.length - 1];
          await db.insert(schema.messages).values({
            threadId,
            role: 'assistant',
            content: finalContent,
            actionResult: actionResult as any,
            steps: steps || lastMsg?.steps,
            tokenUsage: tokenUsage || lastMsg?.tokenUsage,
            purpose: purpose || lastMsg?.purpose,
            activeSkillId,
            completedStages,
            createdAt: new Date().toISOString()
          });

          await db.update(schema.threads)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(schema.threads.id, threadId));
        }
      },
      setMessages: (messages) => set({ messages }),
      clearMessages: async () => {
        const threadId = get().activeThreadId;
        if (threadId) {
          await db.delete(schema.messages).where(eq(schema.messages.threadId, threadId));
        }
        set({ messages: [] });
      },

      checkAIStatus: async () => {
        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

        // Otherwise check Ollama status
        set({ aiStatus: 'checking', aiProgress: 'Checking Ollama status...' });
        try {
          if (isTauri) {
            const invoke = await getTauriInvoke();
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
        const res = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:workspaces')))[0];
        set({ savedWorkspaces: (res?.value as any) || [] });
      },
      saveWorkspace: async (updatedWorkspace: WorkspaceConfig) => {
        const isTemplate = ['tpl-budget-audit', 'tpl-sub-check', 'tpl-groceries-plan'].includes(updatedWorkspace.id);
        const workspaceToSave = isTemplate ? { ...updatedWorkspace, id: `user-${Date.now()}` } : updatedWorkspace;

        const currentSaved = get().savedWorkspaces;
        const filtered = currentSaved.filter((w) => w.id !== workspaceToSave.id);
        const nextList = [...filtered, workspaceToSave];

        await db.insert(schema.settings).values({ key: 'app:workspaces', value: nextList }).onConflictDoNothing();
        set({ savedWorkspaces: nextList });
        if (isTemplate) {
          set({ activeWorkspaceId: workspaceToSave.id });
        }
      },
      deleteWorkspace: async (id: string) => {
        const currentSaved = get().savedWorkspaces;
        const nextList = currentSaved.filter((w) => w.id !== id);
        await db.insert(schema.settings).values({ key: 'app:workspaces', value: nextList }).onConflictDoNothing();
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
        const list = await db.select().from(schema.threads).orderBy(desc(schema.threads.createdAt));
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
        await db.insert(schema.threads).values(newThread).onConflictDoNothing();
        const currentThreads = get().threads;
        set({ threads: [newThread, ...currentThreads], activeThreadId: id, messages: [] });
        return id;
      },

      deleteThread: async (id) => {
        await db.delete(schema.threads).where(eq(schema.threads.id, id));
        await db.delete(schema.messages).where(eq(schema.messages.threadId, id));
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
        const list = await db.select().from(schema.messages).where(eq(schema.messages.threadId, threadId)).orderBy(asc(schema.messages.id));
        const formatted = list.map((m: any) => {
          if (m.actionResult?.metrics?.transactions) {
            delete m.actionResult.metrics.transactions;
            db.insert(schema.messages).values(m).onConflictDoNothing().execute(); // scrub legacy data from db
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
        });
        set({ messages: formatted });
      }
    }),
    {
      name: 'spending-viz:chat',
      partialize: (state) => ({ activeThreadId: state.activeThreadId }),
    }
  )
);

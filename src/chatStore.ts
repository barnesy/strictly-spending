import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { localAI, type ChatMessage } from './ai';

export type AIStatus = 'checking' | 'uninstalled' | 'stopped' | 'running' | 'pulling' | 'ready' | 'error';

interface ChatStore {
  messages: ChatMessage[];
  aiLoaded: boolean;
  aiStatus: AIStatus;
  aiProgress: string;
  aiProgressPercent: number;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  checkAIStatus: () => Promise<void>;
  installOllama: () => Promise<void>;
  startOllama: () => Promise<void>;
  pullModel: () => Promise<void>;
  initializeAI: () => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      aiLoaded: false,
      aiStatus: 'checking',
      aiProgress: '',
      aiProgressPercent: 0,
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      setMessages: (messages) => set({ messages }),
      clearMessages: () => set({ messages: [] }),

      checkAIStatus: async () => {
        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
        set({ aiStatus: 'checking', aiProgress: 'Checking Ollama status...' });
        try {
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
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
          const { invoke } = await import('@tauri-apps/api/core');
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
          const { invoke } = await import('@tauri-apps/api/core');
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
              aiProgress: `Downloading Llama 3.2 1B: ${pct}% (${statusText})`
            });
          });
          set({ aiStatus: 'ready', aiProgress: 'AI Ready', aiLoaded: true, aiProgressPercent: 100 });
        } catch (err: any) {
          set({ aiStatus: 'error', aiProgress: `Model download failed: ${err.message}`, aiProgressPercent: 0 });
        }
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
    }),
    {
      name: 'spending-viz:chat',
      partialize: (state) => ({ messages: state.messages }),
    }
  )
);

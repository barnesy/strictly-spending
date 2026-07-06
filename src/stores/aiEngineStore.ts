import { create } from 'zustand';
import { localAI } from '../ai';

export type AIStatus = 'checking' | 'uninstalled' | 'stopped' | 'running' | 'pulling' | 'ready' | 'error' | 'safemode';

interface AIEngineStore {
  aiLoaded: boolean;
  aiStatus: AIStatus;
  aiProgress: string;
  aiProgressPercent: number;
  modelName: string;
  
  setModelName: (name: string) => void;
  checkAIStatus: (force?: boolean) => Promise<void>;
  installOllama: () => Promise<void>;
  startOllama: () => Promise<void>;
  pullModel: () => Promise<void>;
  cancelPullModel: () => void;
  initializeAI: () => Promise<void>;
  deleteModel: (name: string) => Promise<void>;
}

let cachedTauriInvoke: any = null;
async function getTauriInvoke() {
  if (!cachedTauriInvoke) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedTauriInvoke = invoke;
  }
  return cachedTauriInvoke;
}

let lastStatusCheckTime = 0;

export const useAIEngineStore = create<AIEngineStore>((set, get) => ({
  aiLoaded: false,
  aiStatus: 'checking',
  aiProgress: '',
  aiProgressPercent: 0,
  modelName: localAI.modelName,

  setModelName: (name: string) => {
    localAI.setModelName(name);
    set({ modelName: name });
    get().checkAIStatus();
  },

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

  checkAIStatus: async (force) => {
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

    if (get().aiStatus === 'pulling' && !force) {
      return;
    }

    const now = Date.now();
    if (!force && (now - lastStatusCheckTime < 2000)) {
      return;
    }
    lastStatusCheckTime = now;

    set({ aiStatus: 'checking', aiProgress: 'Checking Ollama status...' });
    try {
      if (isTauri) {
        const invoke = await getTauriInvoke();
        
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
      if (localAI.isLoaded) {
        set({ aiStatus: 'ready', aiProgress: 'AI Ready', aiLoaded: true, aiProgressPercent: 100 });
      } else {
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
  }
}));

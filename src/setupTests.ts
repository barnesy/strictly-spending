import { vi } from 'vitest';

// 1. Mock Tauri's core invoke globally so tests don't crash when APIs are called
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    switch (cmd) {
      case 'get_settings': return [];
      case 'get_rules': return [];
      case 'get_categories': return [];
      case 'get_accounts': return [];
      case 'get_transactions': return [];
      case 'get_budgets': return [];
      case 'get_loans': return [];
      case 'get_artifacts': return [];
      default: return null;
    }
  })
}));

// 2. Mock queryClient to prevent errors when invalidateQueries is called
vi.mock('./queryClient', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    fetchQuery: vi.fn().mockResolvedValue([]),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }
}));

// 3. Global window mocks for generic browser apis that might be missing in node
if (typeof window === 'undefined') {
  (global as any).window = {
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (global as any).localStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
} else {
  window.dispatchEvent = vi.fn();
}

import { invoke } from '@tauri-apps/api/core';

export interface RuleSuggestion {
  pattern: string;
  category: string;
  overridesCount: number;
  sampleDescription: string;
}

export async function mineRuleSuggestions(): Promise<RuleSuggestion[]> {
  try {
    return await invoke<RuleSuggestion[]>('mine_rule_suggestions');
  } catch (e) {
    console.error("Failed to mine rule suggestions natively:", e);
    return [];
  }
}

import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { CategoryRule, Category } from '../types';

export const categorySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  color: z.string().min(1),
  type: z.enum(['spend', 'income', 'transfer']),
  sortOrder: z.number(),
  defaultRecurrence: z.enum(['recurring', 'onetime']).optional()
});

export const categoriesApi = {
  getCategories: () => invoke<Category[]>('get_categories'),
  addCategory: (item: Category) => invoke<number>('add_category', { item: categorySchema.parse(item) }),
  updateCategory: async (id: number, updates: Partial<Category>) => {
    const existing = (await invoke<Category[]>('get_categories')).find(c => c.id === id);
    if (!existing) throw new Error(`Category ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_category', { id, updates: categorySchema.parse(full) });
  },
  deleteCategory: (id: number) => invoke<void>('delete_category', { id }),
  clearCategories: () => invoke<void>('clear_categories'),
};

export const rulesApi = {
  getRules: () => invoke<CategoryRule[]>('get_rules'),
  addRule: (item: CategoryRule) => invoke<number>('add_rule', { item }),
  updateRule: async (id: number, updates: Partial<CategoryRule>) => {
    const existing = (await invoke<CategoryRule[]>('get_rules')).find(r => r.id === id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_rule', { id, updates: full });
  },
  deleteRule: (id: number) => invoke<void>('delete_rule', { id }),
  clearRules: () => invoke<void>('clear_rules'),
};

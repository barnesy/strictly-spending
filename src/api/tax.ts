import { invoke } from '@tauri-apps/api/core';
import type { TaxRule } from '../types';

export const taxApi = {
  getTaxRules: () => invoke<TaxRule[]>('get_tax_rules'),
  putTaxRule: (item: TaxRule) => invoke<void>('put_tax_rule', { item }),
  deleteTaxRule: (id: number) => invoke<void>('delete_tax_rule', { id }),
};

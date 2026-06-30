import { invoke } from '@tauri-apps/api/core';
import type { ImportBatch } from '../types';

export const importsApi = {
  getImports: () => invoke<ImportBatch[]>('get_imports'),
  addImport: (item: ImportBatch) => invoke<number>('add_import', { item }),
  deleteImport: (id: number) => invoke<void>('delete_import', { id }),
  clearImports: () => invoke<void>('clear_imports'),
};

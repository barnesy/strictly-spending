import { invoke } from '@tauri-apps/api/core';
import type { CsvMapping } from '../types';

export const csvMappingsApi = {
  getCsvMappings: () => invoke<CsvMapping[]>('get_csv_mappings'),
  putCsvMapping: (item: CsvMapping) => invoke<void>('put_csv_mapping', { item }),
  deleteCsvMapping: (id: number) => invoke<void>('delete_csv_mapping', { id }),
};

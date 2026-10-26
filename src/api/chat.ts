import { invoke } from '@tauri-apps/api/core';
import type { ChatArtifact } from '../types';

export const chatApi = {
  getArtifacts: () => invoke<ChatArtifact[]>('get_artifacts'),
  putArtifact: (item: ChatArtifact) => invoke<void>('put_artifact', { item }),
  deleteArtifact: (id: string) => invoke<void>('delete_artifact', { id }),
};

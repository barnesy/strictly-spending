import { invoke } from '@tauri-apps/api/core';
import type { ChatArtifact, ChatArtifactVersion, ChatThread, DbChatMessage } from '../types';

export const chatApi = {
  // Artifacts
  getArtifacts: () => invoke<ChatArtifact[]>('get_artifacts'),
  getArtifactVersions: (artifactId: string) => invoke<ChatArtifactVersion[]>('get_artifact_versions', { artifactId }),
  restoreArtifactVersion: (artifactId: string, versionId: string) => invoke<void>('restore_artifact_version', { artifactId, versionId }),
  putArtifact: (item: ChatArtifact) => invoke<void>('put_artifact', { item }),
  deleteArtifact: (id: string) => invoke<void>('delete_artifact', { id }),

  // Threads
  getThreads: () => invoke<ChatThread[]>('get_threads'),
  putThread: (item: ChatThread) => invoke<void>('put_thread', { item }),
  deleteThread: (id: string) => invoke<void>('delete_thread', { id }),
  deleteThreadMessages: (threadId: string) => invoke<void>('delete_thread_messages', { threadId }),

  // Messages
  getMessages: () => invoke<DbChatMessage[]>('get_messages'),
  putMessage: (item: DbChatMessage) => invoke<void>('put_message', { item }),
  deleteMessage: (id: string) => invoke<void>('delete_message', { id }),
};

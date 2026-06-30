import { api } from '../api';
import { invoke } from '@tauri-apps/api/core';
import { localAI } from '../ai';
import type { ChatArtifact } from '../types';

export type PreparedDocument = 
  | { type: 'pdf'; text: string; filename: string; localPath: string }
  | { type: 'image'; filename: string; localPath: string; base64: string };

export async function prepareDocumentForChat(file: File): Promise<PreparedDocument> {
    // 1. Save document via IPC to ensure it's on disk if we need to open it later
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const localPath = await invoke<string>('save_document', { bytes: Array.from(bytes), filename: file.name });

    // 2. Branch by file type
    if (file.type === 'application/pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }

        return { type: 'pdf', text: fullText, filename: file.name, localPath };
    } else {
        // Image Receipt logic
        const base64 = await invoke<string>('read_document_base64', { path: localPath });
        return { type: 'image', base64: `data:${file.type};base64,${base64}`, filename: file.name, localPath };
    }
}

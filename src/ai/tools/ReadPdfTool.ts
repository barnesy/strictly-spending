import type { AIToolHandler, ToolExecutionResult } from './index';
import type { AIToolContext } from './index';
import { readFile } from '@tauri-apps/plugin-fs';


// We need to set up the worker for pdfjs in browser environments.
// For Vite, we can usually import the worker script directly or just ignore it if it runs locally.
// pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

export class ReadPdfTool implements AIToolHandler {
  name = 'read_pdf';

  async execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult> {
    const { path } = actionObj;

    if (!path) {
      return { feedbackError: 'Missing required field (path) - must be an absolute path to a local PDF file.' };
    }

    try {
      const pdfjsLib = await import('pdfjs-dist');
      // Set up worker source dynamically using Vite's ?url
      const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

      const uint8Array = await readFile(path);
      
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract text items
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
          
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }
      
      return {
        actionResult: { action: 'read_pdf', path },
        data: { text: fullText.trim() }
      };
      
    } catch (e: any) {
      return { feedbackError: `Failed to read or parse PDF at ${path}: ${e.message}` };
    }
  }
}

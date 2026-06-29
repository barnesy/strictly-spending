export const downloadFile = async (content: string | Uint8Array, filename: string, contentType: string) => {
  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  
  if (isTauri) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile, writeFile } = await import('@tauri-apps/plugin-fs');
      
      const extension = filename.split('.').pop() || '';
      const filters = [];
      if (extension === 'csv') {
        filters.push({ name: 'CSV Spreadsheet', extensions: ['csv'] });
      } else if (extension === 'md') {
        filters.push({ name: 'Markdown Document', extensions: ['md'] });
      } else if (extension === 'zip') {
        filters.push({ name: 'ZIP Archive', extensions: ['zip'] });
      }
      
      const filePath = await save({
        defaultPath: filename,
        filters
      });
      
      if (filePath) {
        if (content instanceof Uint8Array) {
          await writeFile(filePath, content);
        } else {
          await writeTextFile(filePath, content);
        }
      }
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  } else {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

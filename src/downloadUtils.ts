import * as echarts from 'echarts';

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

export const downloadMarkdownWithCharts = (originalContent: string, filename: string, containerElement?: HTMLElement | null) => {
  let contentToDownload = originalContent.replace(/\\n/g, '\n');
  
  const root = containerElement || document;
  const chartDivs = root.querySelectorAll('.artifact-chart') as NodeListOf<HTMLDivElement>;
  let chartIndex = 0;
  contentToDownload = contentToDownload.replace(/^```(.*)\n([\s\S]*?)^```/gm, (match, lang, innerText) => {
    const language = lang.trim().toLowerCase();
    if (['echarts', 'json', 'javascript', 'js', ''].includes(language)) {
      try {
        let parsed = null;
        try { parsed = JSON.parse(innerText); }
        catch(e) { const fn = new Function('return (' + innerText + ')'); parsed = fn(); }
        
        if (parsed && typeof parsed === 'object') {
          if (language === 'echarts' || (parsed.series && Array.isArray(parsed.series))) {
            const div = chartDivs[chartIndex++];
            if (div) {
              const instance = echarts.getInstanceByDom(div);
              if (instance) {
                // Ensure a solid white background and higher resolution
                const dataUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
                return `<details>\n<summary>View Chart Data</summary>\n\n${match}\n\n</details>\n\n![Chart Snapshot](${dataUrl})`;
              }
            }
          }
        }
      } catch(e) {}
    }
    return match;
  });

  downloadFile(contentToDownload, filename, 'text/markdown;charset=utf-8;');
};

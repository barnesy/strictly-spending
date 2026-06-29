export async function confirmDialog(message: string, title?: string): Promise<boolean> {
  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  if (isTauri) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message, { title });
    } catch (e) {
      console.warn('Failed to use Tauri confirm dialog:', e);
      return window.confirm(message);
    }
  }
  return window.confirm(message);
}

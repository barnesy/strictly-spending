export async function getLocalModels(): Promise<any[]> {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

export async function deleteLocalModel(name: string): Promise<void> {
  const response = await fetch('http://localhost:11434/api/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    throw new Error(`Failed to delete model: ${response.statusText}`);
  }
}

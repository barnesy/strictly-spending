/**
 * SHA-256 hash of a string, returned as lowercase hex.
 * Uses Web Crypto API (available in all modern browsers).
 */
export async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

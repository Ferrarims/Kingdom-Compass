export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    try {
      return window.crypto.randomUUID();
    } catch (e) {}
  }
  // Standard RFC 4122 Compliant Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateDeterministicUUID(namespace: string, input: string): string {
  const str = namespace + input;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const s1 = ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padEnd(16, '0');
  const s2 = ((Math.imul(h1, h2) >>> 0).toString(16) + (Math.imul(h2, 987654321) >>> 0).toString(16)).padEnd(16, '0');
  const hex = (s1 + s2).slice(0, 32);
  
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32)
  ].join('-');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ensureValidUUID(id: string | null | undefined, namespace: string, fallbackInput: string): string {
  if (id && UUID_REGEX.test(id)) {
    return id;
  }
  return generateDeterministicUUID(namespace, fallbackInput || id || 'fallback');
}

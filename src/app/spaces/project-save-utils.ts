export function quickHashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function projectSaveFingerprint(value: unknown): string {
  const json = JSON.stringify(value);
  return `${json.length}:${quickHashString(json)}`;
}

export function jsonByteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

export function projectSavePayloadBytes(value: unknown): number {
  return jsonByteLength(JSON.stringify(value));
}

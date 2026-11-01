/** Loads only embedded Base64 or locally-created Blob URLs. Never accepts remote URLs. */
export async function readLocalAssetBytes(source: string, encodedLimit: number, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const inline = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (inline) {
    if (inline[1].length > encodedLimit) throw new Error(message);
    const binary = atob(inline[1]);
    const length = binary.length;
    const bytes = new Uint8Array(new ArrayBuffer(length));
    for (let i = 0; i < length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (!source.startsWith('blob:')) throw new Error(message);
  const result = await fetch(source);
  if (!result.ok) throw new Error(message);
  const blob = await result.blob();
  if (blob.size > Math.floor(encodedLimit * 3 / 4)) throw new Error(message);
  return new Uint8Array(await blob.arrayBuffer());
}

// Persistent byte cache for Piper model/config downloads, backed by the CacheStorage API
// so a ~60MB voice model is only ever downloaded once per Anki profile.
const CACHE_NAME = "anki-tts-piper-v1";

export async function cachedFetch(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url);
  if (hit) return hit;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);

  if (onProgress && res.body) {
    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    const cachedRes = new Response(new Blob(chunks as BlobPart[]), { headers: res.headers });
    await cache.put(url, cachedRes.clone());
    return cachedRes;
  }

  await cache.put(url, res.clone());
  return res;
}

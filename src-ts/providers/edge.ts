import { EdgeVoice } from "../types.js";

// Loaded lazily via dynamic ESM import, same as the original anki_tts.js.
let ttsInstance: any = null;
let edgeVoices: EdgeVoice[] | null = null;
let edgeAudio = new Audio("");

const EDGE_TTS_LIB_URL = "https://cdn.jsdelivr.net/npm/edge-tts-browser@latest/+esm";

async function loadLib(): Promise<any> {
  return import(/* @vite-ignore */ EDGE_TTS_LIB_URL);
}

let initPromise: Promise<boolean> | null = null;

export function initEdgeTts(): Promise<boolean> {
  if (edgeVoices) return Promise.resolve(true);
  if (!initPromise) {
    initPromise = (async () => {
      try {
        console.log("Loading Edge TTS…");
        const { default: EdgeTtsBrowser } = await loadLib();
        ttsInstance = new EdgeTtsBrowser();
        edgeVoices = await EdgeTtsBrowser.getVoices();
        console.log("Edge TTS ready:", edgeVoices?.length, "voices");
        return true;
      } catch (error) {
        console.error("Failed to initialize Edge TTS:", error);
        initPromise = null;
        return false;
      }
    })();
  }
  return initPromise;
}

export function getEdgeVoices(): EdgeVoice[] | null {
  return edgeVoices;
}

// speech.platform.bing.com only accepts its websocket connection from the real Microsoft
// Edge browser (verified: identical request 403s from Chrome, succeeds from Edge). Browsers
// forbid JS from overriding the User-Agent header used for that check, so it can't be worked
// around from this file directly. Instead: npm run relay runs a local Node process (see
// relay-ts/edge-tts-relay.ts) that makes the same connection from outside the browser
// sandbox, where custom headers are legal.
// We try that relay first and only fall back to the direct in-browser connection (which only
// works in real Edge) if it isn't running.
const RELAY_BASE = "http://127.0.0.1:8811";
let relayAvailable: Promise<boolean> | null = null;

function checkRelay(): Promise<boolean> {
  if (!relayAvailable) {
    relayAvailable = fetch(`${RELAY_BASE}/health`, { signal: AbortSignal.timeout(400) })
      .then(res => res.ok)
      .catch(() => false)
      .then(ok => {
        console.log(ok ? "Edge TTS relay detected at " + RELAY_BASE : "Edge TTS relay not running — using direct connection (real Microsoft Edge only)");
        return ok;
      });
  }
  return relayAvailable;
}

async function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  edgeAudio = new Audio(url);
  console.log("Playing audio");
  await edgeAudio.play();
  edgeAudio.onended = () => URL.revokeObjectURL(url);
}

async function playViaRelay(text: string, voice: string): Promise<void> {
  const params = new URLSearchParams({ text, voice });
  const res = await fetch(`${RELAY_BASE}/tts?${params}`);
  if (!res.ok) throw new Error(`Edge TTS relay error: ${await res.text()}`);
  await playBlob(await res.blob());
}

async function playDirect(text: string, voice: string): Promise<void> {
  if (!ttsInstance && !(await initEdgeTts())) {
    throw new Error("Failed to initialize Edge TTS");
  }

  ttsInstance.tts.setVoiceParams({ text, voice });
  const fileName = `tts-output-${crypto.randomUUID()}-${ttsInstance.tts.fileType.ext}`;

  let blob: Blob;
  try {
    blob = await ttsInstance.ttsToFile(fileName);
  } catch (error) {
    console.error("Edge TTS websocket failed:", error);
    throw new Error(
      "Edge TTS only works in the real Microsoft Edge browser, or with the local relay " +
      "running (npm run relay). Microsoft's server rejects this connection from Chrome, " +
      "Firefox, Safari, and Anki's own review window otherwise. Switch to the Piper engine " +
      "in Settings (offline, works everywhere) as another option."
    );
  }

  await playBlob(blob);
}

export async function edgeTtsPlay(text: string, voice = "zh-CN-XiaoxiaoNeural"): Promise<void> {
  if (!text || !text.trim()) {
    console.warn("No text provided for TTS");
    return;
  }

  const trimmed = text.trim();
  console.log("edgeTtsPlay:", voice, JSON.stringify(trimmed));

  if (await checkRelay()) {
    await playViaRelay(trimmed, voice);
  } else {
    await playDirect(trimmed, voice);
  }
}

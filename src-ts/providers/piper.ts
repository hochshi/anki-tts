import { cachedFetch } from "../cache.js";
import { logLine } from "../log.js";
import { pcmToWav } from "../wav.js";
import { PiperModelConfig, PiperVoice } from "../types.js";

// Voice models: full, live catalog straight from the source repo (never bundled/mirrored,
// so new voices show up automatically).
const VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/";
// Phonemizer (espeak-ng compiled to wasm) and ONNX runtime: fetched from CDN at runtime,
// never bundled, so the addon script itself stays tiny.
const PHONEMIZE_BASE = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/";
const ONNX_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";

// Universal across every espeak-type Piper voice (verified against multiple models' own
// phoneme_id_map): bos '^', eos '$', pad '_' interspersed between every phoneme.
const PHONEME_ID: { pad: string; bos: string; eos: string } = { pad: "_", bos: "^", eos: "$" };

interface PhonemizeResult {
  readonly text: string;
  readonly phonemes: string[];
  // Pre-computed by piper_phonemize itself against its built-in default id map, which is
  // identical to every published voice's own phoneme_id_map for espeak-type models. Used
  // directly when present; toPhonemeIds() below is the fallback.
  readonly phoneme_ids?: number[];
}

let piperAudio = new Audio("");
let voicesPromise: Promise<Record<string, PiperVoice>> | null = null;
let phonemizerPromise: Promise<{ phonemize(texts: string[], lang: string): PhonemizeResult[] }> | null = null;
let ortReadyPromise: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

export async function getPiperVoices(): Promise<Record<string, PiperVoice>> {
  if (voicesPromise) return voicesPromise;
  voicesPromise = (async () => {
    const cached = localStorage.getItem("piperVoicesJson");
    const cachedAt = Number(localStorage.getItem("piperVoicesJsonAt") || 0);
    if (cached && Date.now() - cachedAt < 7 * 24 * 3600 * 1000) {
      logLine("log", "Using cached Piper voice list");
      return JSON.parse(cached);
    }
    try {
      logLine("log", "Fetching Piper voice list from", VOICES_BASE + "voices.json");
      const res = await fetch(VOICES_BASE + "voices.json");
      const json = await res.text();
      localStorage.setItem("piperVoicesJson", json);
      localStorage.setItem("piperVoicesJsonAt", String(Date.now()));
      const parsed = JSON.parse(json);
      logLine("log", "Loaded", Object.keys(parsed).length, "Piper voices");
      return parsed;
    } catch (error) {
      if (cached) return JSON.parse(cached);
      throw error;
    }
  })();
  return voicesPromise;
}

function getPhonemizer() {
  if (!phonemizerPromise) {
    logLine("log", "Loading phonemizer (espeak-ng wasm)…");
    phonemizerPromise = loadScript(PHONEMIZE_BASE + "piper_phonemize.js").then(() => {
      let results: PhonemizeResult[] = [];
      return (window as any).createPiperPhonemize({
        print(line: string) { results.push(JSON.parse(line)); },
        // The espeak-ng-data package loader ignores scriptDirectory and needs this explicitly,
        // otherwise it resolves piper_phonemize.data against the page URL instead of the CDN.
        locateFile: (path: string) => PHONEMIZE_BASE + path
      }).then((mod: { callMain(args: string[]): number }) => {
        logLine("log", "Phonemizer ready");
        return {
          phonemize(texts: string[], lang: string) {
            results = [];
            const exitCode = mod.callMain([
              "--espeak_data", "/espeak-ng-data",
              "--language", lang,
              "--input", JSON.stringify(texts.map(text => ({ text })))
            ]);
            if (exitCode !== 0) throw new Error("piper_phonemize exited with code " + exitCode);
            return results;
          }
        };
      });
    });
  }
  return phonemizerPromise;
}

function getOrt() {
  if (!ortReadyPromise) {
    logLine("log", "Loading ONNX Runtime Web…");
    ortReadyPromise = loadScript(ONNX_BASE + "ort.min.js").then(() => {
      const ort = (window as any).ort;
      ort.env.wasm.wasmPaths = ONNX_BASE;
      // Cross-origin isolation (SharedArrayBuffer) generally isn't available inside Anki's
      // webview, so stick to the single-threaded wasm build.
      ort.env.wasm.numThreads = 1;
      logLine("log", "ONNX Runtime Web ready");
      return ort;
    });
  }
  return ortReadyPromise;
}

function toPhonemeIds(phonemes: readonly string[], modelConfig: PiperModelConfig): number[] {
  const idMap = modelConfig.phoneme_id_map;
  if (!idMap) throw new Error("Voice is missing phoneme_id_map");

  const ids: number[] = [];
  const push = (p: string) => { if (idMap[p]) ids.push(...idMap[p]); };

  push(PHONEME_ID.bos);
  push(PHONEME_ID.pad);
  for (const p of phonemes) {
    if (!idMap[p]) continue;
    push(p);
    push(PHONEME_ID.pad);
  }
  push(PHONEME_ID.eos);
  return ids;
}

export function findModelFile(voice: PiperVoice): string {
  const modelFile = Object.keys(voice.files).find(f => f.endsWith(".onnx"));
  if (!modelFile) throw new Error("Can't find .onnx file for voice " + voice.key);
  return modelFile;
}

export type StatusCallback = (msg: string, percent?: number) => void;

export async function downloadPiperVoice(voice: PiperVoice, onStatus?: StatusCallback): Promise<void> {
  const modelFile = findModelFile(voice);
  await Promise.all([
    cachedFetch(VOICES_BASE + modelFile, (loaded, total) => reportProgress(onStatus, voice.name, loaded, total)),
    cachedFetch(VOICES_BASE + modelFile + ".json")
  ]);
  onStatus?.("");
}

let lastLoggedPercent = -1;
function reportProgress(onStatus: StatusCallback | undefined, name: string, loaded: number, total: number): void {
  const percent = total ? Math.round((loaded / total) * 100) : undefined;
  onStatus?.(`Downloading ${name}… ${percent != null ? percent + "%" : ""}`, percent);
  if (percent != null && percent >= lastLoggedPercent + 20) {
    lastLoggedPercent = percent;
    logLine("log", `Downloading ${name}: ${percent}% (${(loaded / 1e6).toFixed(1)}MB / ${(total / 1e6).toFixed(1)}MB)`);
  }
}

export async function piperTtsPlay(text: string, voiceKey: string, speakerId?: number, onStatus?: StatusCallback): Promise<void> {
  if (!text || !text.trim()) {
    console.warn("No text provided for TTS");
    return;
  }

  logLine("log", "piperTtsPlay:", voiceKey, speakerId != null ? `speaker=${speakerId}` : "", JSON.stringify(text));

  const voices = await getPiperVoices();
  const voice = voices[voiceKey];
  if (!voice) throw new Error("Unknown Piper voice: " + voiceKey);
  const modelFile = findModelFile(voice);

  lastLoggedPercent = -1;
  onStatus?.(`Loading ${voice.name}…`);
  const [modelRes, configRes, { phonemize }, ort] = await Promise.all([
    cachedFetch(VOICES_BASE + modelFile, (loaded, total) => reportProgress(onStatus, voice.name, loaded, total)),
    cachedFetch(VOICES_BASE + modelFile + ".json"),
    getPhonemizer(),
    getOrt()
  ]);
  logLine("log", "Model + config downloaded:", modelFile);
  const modelConfig: PiperModelConfig = await configRes.clone().json();
  const modelBuffer = await modelRes.clone().arrayBuffer();

  const sampleRate = modelConfig.audio?.sample_rate ?? 22050;
  const noiseScale = modelConfig.inference?.noise_scale ?? 0.667;
  const lengthScale = modelConfig.inference?.length_scale ?? 1;
  const noiseW = modelConfig.inference?.noise_w ?? 0.8;

  onStatus?.("Phonemizing…");
  const [result] = phonemize([text.trim()], modelConfig.espeak.voice);
  const phonemes = result?.phonemes ?? [];
  const ids = result?.phoneme_ids ?? toPhonemeIds(phonemes, modelConfig);
  logLine("log", "Phonemes:", phonemes.join(" "));
  logLine("log", "Phoneme ids:", ids.length, "ids");
  if (!ids.length) { onStatus?.(""); return; }

  onStatus?.("Loading model…");
  const session = await ort.InferenceSession.create(modelBuffer);
  try {
    onStatus?.("Synthesizing…");
    const feeds: Record<string, any> = {
      input: new ort.Tensor("int64", ids, [1, ids.length]),
      input_lengths: new ort.Tensor("int64", [ids.length]),
      scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW])
    };
    if (speakerId != null) feeds.sid = new ort.Tensor("int64", [speakerId]);

    const { output } = await session.run(feeds);
    const samples = output.data as Float32Array;
    logLine("log", `Synthesized ${samples.length} samples @ ${sampleRate}Hz (${(samples.length / sampleRate).toFixed(2)}s)`);

    onStatus?.("");
    const blob = pcmToWav([{ samples, sampleRate, numChannels: 1 }]);
    const url = URL.createObjectURL(blob);
    piperAudio = new Audio(url);
    logLine("log", "Playing audio");
    await piperAudio.play();
    piperAudio.onended = () => URL.revokeObjectURL(url);
  } finally {
    await session.release();
  }
}

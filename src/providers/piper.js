import { cachedFetch } from "../cache.js";
import { logLine } from "../log.js";
import { playAudio } from "../player.js";
import { pcmToWav } from "../wav.js";
// Voice models: full, live catalog straight from the source repo (never bundled/mirrored,
// so new voices show up automatically).
const VOICES_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/";
// Phonemizer (espeak-ng compiled to wasm) and ONNX runtime: fetched from CDN at runtime,
// never bundled, so the addon script itself stays tiny.
const PHONEMIZE_BASE = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/";
const ONNX_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";
// Universal across every espeak-type Piper voice (verified against multiple models' own
// phoneme_id_map): bos '^', eos '$', pad '_' interspersed between every phoneme.
const PHONEME_ID = { pad: "_", bos: "^", eos: "$" };
let voicesPromise = null;
let phonemizerPromise = null;
let ortReadyPromise = null;
// Keep at most one Piper model resident. An ONNX InferenceSession owns the expensive
// WASM-side model state, so reusing it avoids rebuilding the same model on every card.
// The raw model ArrayBuffer is intentionally not stored in this cache.
let cachedPiperVoiceKey = null;
let cachedPiperBundlePromise = null;
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-src="${src}"]`))
            return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.dataset.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(s);
    });
}
export async function getPiperVoices() {
    if (voicesPromise)
        return voicesPromise;
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
        }
        catch (error) {
            if (cached)
                return JSON.parse(cached);
            throw error;
        }
    })();
    return voicesPromise;
}
function getPhonemizer() {
    if (!phonemizerPromise) {
        logLine("log", "Loading phonemizer (espeak-ng wasm)…");
        phonemizerPromise = loadScript(PHONEMIZE_BASE + "piper_phonemize.js").then(() => {
            let results = [];
            return window.createPiperPhonemize({
                print(line) { results.push(JSON.parse(line)); },
                // The espeak-ng-data package loader ignores scriptDirectory and needs this explicitly,
                // otherwise it resolves piper_phonemize.data against the page URL instead of the CDN.
                locateFile: (path) => PHONEMIZE_BASE + path
            }).then((mod) => {
                logLine("log", "Phonemizer ready");
                return {
                    phonemize(texts, lang) {
                        results = [];
                        const exitCode = mod.callMain([
                            "--espeak_data", "/espeak-ng-data",
                            "--language", lang,
                            "--input", JSON.stringify(texts.map(text => ({ text })))
                        ]);
                        if (exitCode !== 0)
                            throw new Error("piper_phonemize exited with code " + exitCode);
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
            const ort = window.ort;
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
async function releaseCachedPiperSession() {
    const bundlePromise = cachedPiperBundlePromise;
    const voiceKey = cachedPiperVoiceKey;
    // Clear the public cache state before awaiting anything so a later request cannot reuse a
    // session that is being torn down.
    cachedPiperBundlePromise = null;
    cachedPiperVoiceKey = null;
    if (!bundlePromise)
        return;
    try {
        const bundle = await bundlePromise;
        await bundle.session.release();
        logLine("log", "Released cached Piper session:", voiceKey || "unknown voice");
    }
    catch (error) {
        // If initialization itself failed, there may be no session to release.
        console.warn("Failed to release cached Piper session:", error);
    }
}
async function getPiperBundle(voiceKey, voice, ort, onStatus) {
    if (cachedPiperBundlePromise && cachedPiperVoiceKey === voiceKey) {
        logLine("log", "Reusing cached Piper session:", voiceKey);
        return cachedPiperBundlePromise;
    }
    // A voice switch replaces, rather than accumulates, model state in RAM.
    await releaseCachedPiperSession();
    cachedPiperVoiceKey = voiceKey;
    cachedPiperBundlePromise = (async () => {
        const modelFile = findModelFile(voice);
        lastLoggedPercent = -1;
        onStatus?.(`Loading ${voice.name}…`);
        const [modelRes, configRes] = await Promise.all([
            cachedFetch(VOICES_BASE + modelFile, (loaded, total) => reportProgress(onStatus, voice.name, loaded, total)),
            cachedFetch(VOICES_BASE + modelFile + ".json")
        ]);
        logLine("log", "Model + config available:", modelFile);
        const modelConfig = await configRes.clone().json();
        // Do not retain this buffer after session creation. The persistent copy remains in
        // CacheStorage and the InferenceSession retains only its own runtime model state.
        const modelBuffer = await modelRes.clone().arrayBuffer();
        onStatus?.("Loading model…");
        const session = await ort.InferenceSession.create(modelBuffer);
        logLine("log", "Cached Piper session ready:", voiceKey);
        return { session, modelConfig };
    })();
    try {
        return await cachedPiperBundlePromise;
    }
    catch (error) {
        // Never leave a rejected initialization promise cached permanently.
        if (cachedPiperVoiceKey === voiceKey) {
            cachedPiperBundlePromise = null;
            cachedPiperVoiceKey = null;
        }
        throw error;
    }
}
export async function releasePiperSession() {
    await releaseCachedPiperSession();
}
function toPhonemeIds(phonemes, modelConfig) {
    const idMap = modelConfig.phoneme_id_map;
    if (!idMap)
        throw new Error("Voice is missing phoneme_id_map");
    const ids = [];
    const push = (p) => { if (idMap[p])
        ids.push(...idMap[p]); };
    push(PHONEME_ID.bos);
    push(PHONEME_ID.pad);
    for (const p of phonemes) {
        if (!idMap[p])
            continue;
        push(p);
        push(PHONEME_ID.pad);
    }
    push(PHONEME_ID.eos);
    return ids;
}
const SENTENCE_END = /[。！？.!?]/;
const SEMICOLON = /[；;]/;
const COMMA = /[，、,]/;
export function splitForPauses(text) {
    const clauses = [];
    let buf = "";
    for (const ch of text) {
        buf += ch;
        if (SENTENCE_END.test(ch)) {
            clauses.push({ text: buf, pauseMs: 350 });
            buf = "";
        }
        else if (SEMICOLON.test(ch)) {
            clauses.push({ text: buf, pauseMs: 250 });
            buf = "";
        }
        else if (COMMA.test(ch)) {
            clauses.push({ text: buf, pauseMs: 180 });
            buf = "";
        }
    }
    if (buf.trim())
        clauses.push({ text: buf, pauseMs: 0 });
    const kept = clauses.filter((c) => c.text.trim());
    if (kept.length)
        kept[kept.length - 1].pauseMs = 0;
    return kept;
}
export function findModelFile(voice) {
    const modelFile = Object.keys(voice.files).find(f => f.endsWith(".onnx"));
    if (!modelFile)
        throw new Error("Can't find .onnx file for voice " + voice.key);
    return modelFile;
}
export async function downloadPiperVoice(voice, onStatus) {
    const modelFile = findModelFile(voice);
    await Promise.all([
        cachedFetch(VOICES_BASE + modelFile, (loaded, total) => reportProgress(onStatus, voice.name, loaded, total)),
        cachedFetch(VOICES_BASE + modelFile + ".json")
    ]);
    onStatus?.("");
}
let lastLoggedPercent = -1;
function reportProgress(onStatus, name, loaded, total) {
    const percent = total ? Math.round((loaded / total) * 100) : undefined;
    onStatus?.(`Downloading ${name}… ${percent != null ? percent + "%" : ""}`, percent);
    if (percent != null && percent >= lastLoggedPercent + 20) {
        lastLoggedPercent = percent;
        logLine("log", `Downloading ${name}: ${percent}% (${(loaded / 1e6).toFixed(1)}MB / ${(total / 1e6).toFixed(1)}MB)`);
    }
}
export async function piperTtsPlay(text, voiceKey, speakerId, onStatus) {
    if (!text || !text.trim()) {
        console.warn("No text provided for TTS");
        return;
    }
    logLine("log", "piperTtsPlay:", voiceKey, speakerId != null ? `speaker=${speakerId}` : "", JSON.stringify(text));
    const voices = await getPiperVoices();
    const voice = voices[voiceKey];
    if (!voice)
        throw new Error("Unknown Piper voice: " + voiceKey);
    const [{ phonemize }, ort] = await Promise.all([
        getPhonemizer(),
        getOrt()
    ]);
    const { session, modelConfig } = await getPiperBundle(voiceKey, voice, ort, onStatus);
    const sampleRate = modelConfig.audio?.sample_rate ?? 22050;
    const noiseScale = modelConfig.inference?.noise_scale ?? 0.667;
    const lengthScale = modelConfig.inference?.length_scale ?? 1;
    const noiseW = modelConfig.inference?.noise_w ?? 0.8;
    const clauses = splitForPauses(text.trim());
    onStatus?.("Phonemizing…");
    const results = phonemize(clauses.map((c) => c.text), modelConfig.espeak.voice);
    const chunks = [];
    for (let i = 0; i < clauses.length; i++) {
        const result = results[i];
        const phonemes = result?.phonemes ?? [];
        const ids = result?.phoneme_ids ?? toPhonemeIds(phonemes, modelConfig);
        logLine("log", "Phonemes:", phonemes.join(" "));
        logLine("log", "Phoneme ids:", ids.length, "ids");
        if (!ids.length)
            continue;
        onStatus?.(clauses.length > 1 ? `Synthesizing… (${i + 1}/${clauses.length})` : "Synthesizing…");
        const feeds = {
            input: new ort.Tensor("int64", ids, [1, ids.length]),
            input_lengths: new ort.Tensor("int64", [ids.length]),
            scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW])
        };
        if (speakerId != null)
            feeds.sid = new ort.Tensor("int64", [speakerId]);
        const { output } = await session.run(feeds);
        chunks.push({ samples: output.data, sampleRate, numChannels: 1 });
        // The gap that makes punctuation actually pause, since the model
        // itself won't: real silence spliced between clauses rather than
        // trusting the phonemizer to have encoded a break for "," or ".".
        if (clauses[i].pauseMs > 0) {
            const silence = new Float32Array(Math.round((clauses[i].pauseMs / 1000) * sampleRate));
            chunks.push({ samples: silence, sampleRate, numChannels: 1 });
        }
    }
    if (!chunks.length) {
        onStatus?.("");
        return;
    }
    const totalSamples = chunks.reduce((n, c) => n + c.samples.length, 0);
    logLine("log", `Synthesized ${totalSamples} samples @ ${sampleRate}Hz across ${clauses.length} clause(s)`);
    onStatus?.("");
    const blob = pcmToWav(chunks);
    logLine("log", "Playing audio");
    await playAudio(blob);
}

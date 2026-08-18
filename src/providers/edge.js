// Loaded lazily via dynamic ESM import, same as the original anki_tts.js.
let ttsInstance = null;
let edgeVoices = null;
let edgeAudio = new Audio("");
const EDGE_TTS_LIB_URL = "https://cdn.jsdelivr.net/npm/edge-tts-browser@latest/+esm";
async function loadLib() {
    return import(/* @vite-ignore */ EDGE_TTS_LIB_URL);
}
let initPromise = null;
export function initEdgeTts() {
    if (edgeVoices)
        return Promise.resolve(true);
    if (!initPromise) {
        initPromise = (async () => {
            try {
                console.log("Loading Edge TTS…");
                const { default: EdgeTtsBrowser } = await loadLib();
                ttsInstance = new EdgeTtsBrowser();
                edgeVoices = await EdgeTtsBrowser.getVoices();
                console.log("Edge TTS ready:", edgeVoices?.length, "voices");
                return true;
            }
            catch (error) {
                console.error("Failed to initialize Edge TTS:", error);
                initPromise = null;
                return false;
            }
        })();
    }
    return initPromise;
}
export function getEdgeVoices() {
    return edgeVoices;
}
export async function edgeTtsPlay(text, voice = "zh-CN-XiaoxiaoNeural") {
    if (!text || !text.trim()) {
        console.warn("No text provided for TTS");
        return;
    }
    if (!ttsInstance && !(await initEdgeTts())) {
        throw new Error("Failed to initialize Edge TTS");
    }
    console.log("edgeTtsPlay:", voice, JSON.stringify(text));
    ttsInstance.tts.setVoiceParams({ text: text.trim(), voice });
    const fileName = `tts-output-${crypto.randomUUID()}-${ttsInstance.tts.fileType.ext}`;
    let blob;
    try {
        blob = await ttsInstance.ttsToFile(fileName);
    }
    catch (error) {
        // Microsoft's speech.platform.bing.com only accepts this websocket connection from the
        // real Microsoft Edge browser (rejects with HTTP 403 otherwise). Browsers forbid JS from
        // overriding the User-Agent header, so this can't be worked around client-side — not in
        // this browser, and not inside Anki's own review window either. See README for detail.
        console.error("Edge TTS websocket failed:", error);
        throw new Error("Edge TTS only works in the real Microsoft Edge browser — Microsoft's server rejects " +
            "this connection from Chrome, Firefox, Safari, and Anki's own review window. Switch to " +
            "the Piper engine in Settings (offline, works everywhere) or open this page in Edge.");
    }
    const url = URL.createObjectURL(blob);
    edgeAudio = new Audio(url);
    console.log("Playing audio");
    await edgeAudio.play();
    edgeAudio.onended = () => URL.revokeObjectURL(url);
}

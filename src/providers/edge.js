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
    const blob = await ttsInstance.ttsToFile(fileName);
    const url = URL.createObjectURL(blob);
    edgeAudio = new Audio(url);
    console.log("Playing audio");
    await edgeAudio.play();
    edgeAudio.onended = () => URL.revokeObjectURL(url);
}

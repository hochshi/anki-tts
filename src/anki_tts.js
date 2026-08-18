/**
 * Anki TTS
 * https://github.com/krmanki/anki-tts
 * krmanki
 * MIT
 *
 * Provides two selectable TTS engines to Anki card templates: Microsoft Edge
 * (online) and Piper (offline, on-device neural TTS, powered by ONNX Runtime
 * Web + rhasspy/piper-voices from Hugging Face). Click "⚙ Settings" during
 * review to pick an engine, locale and voice.
 */
import { edgeTtsPlay, initEdgeTts } from "./providers/edge.js";
import { piperTtsPlay } from "./providers/piper.js";
import { stopPlayback } from "./player.js";
import { getEdgeLocal, getPiperLocal, setupTtsConfig, showConfig, ttsPlay } from "./ui.js";
setupTtsConfig();
// Defensive: stop any audio left over from a previous card. ttsPlay() also stops on every new
// play, but Anki's classic inline <script> block (unlike this module) reliably re-runs on
// every card - call window.stopTts() at the top of that block (outside playTts()) for the
// case where the user advances cards fast enough that nothing gets clicked at all. See README.
stopPlayback();
document.addEventListener("DOMContentLoaded", () => {
    initEdgeTts().catch(error => console.error("Failed to initialize Edge TTS:", error));
});
// Exposed for Anki card templates. getLocal()/edgeTtsPlay() are kept for backwards
// compatibility with existing card templates that call them directly.
window.showConfig = showConfig;
window.ttsPlay = ttsPlay;
window.stopTts = stopPlayback;
window.getLocal = getEdgeLocal;
window.getPiperLocal = getPiperLocal;
window.edgeTtsPlay = edgeTtsPlay;
window.piperTtsPlay = piperTtsPlay;

import { icon } from "./dom.js";
const g = window;
function syncUI() {
    const container = document.getElementById("ttsButtonContainer");
    const playBtn = document.getElementById("ttsPlayButton");
    const stopBtn = document.getElementById("ttsStopButton");
    const progress = document.getElementById("ttsPlaybackProgress");
    if (!playBtn || !stopBtn || !progress)
        return;
    const audio = g.__ttsAudio;
    if (!audio) {
        // The whole player hides between plays rather than sitting on the card as
        // permanent chrome — a card can have many speak buttons (one per example
        // sentence) and none of them need a floating Play/Stop/progress bar until
        // one is actually pressed.
        if (container)
            container.style.display = "none";
        playBtn.innerHTML = `${icon("play")}<span>Play</span>`;
        stopBtn.style.display = "none";
        progress.style.display = "none";
        return;
    }
    if (container)
        container.style.display = "flex";
    stopBtn.style.display = "inline-flex";
    progress.style.display = "block";
    progress.max = audio.duration || 0;
    progress.value = audio.currentTime || 0;
    playBtn.innerHTML = audio.paused
        ? `${icon("play")}<span>Resume</span>`
        : `${icon("pause")}<span>Pause</span>`;
}
// Stops and discards whatever is currently playing, if anything - including audio started by
// a previous card. Called unconditionally at the top of every ttsPlay()/playAudio() and card
// script run, so a fast card advance never leaves a leftover sentence talking over the next.
export function stopPlayback() {
    if (g.__ttsAudio) {
        g.__ttsAudio.pause();
        g.__ttsAudio.currentTime = 0;
    }
    if (g.__ttsAudioUrl)
        URL.revokeObjectURL(g.__ttsAudioUrl);
    g.__ttsAudio = undefined;
    g.__ttsAudioUrl = undefined;
    syncUI();
}
export async function playAudio(blob) {
    stopPlayback();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    g.__ttsAudio = audio;
    g.__ttsAudioUrl = url;
    audio.addEventListener("play", syncUI);
    audio.addEventListener("pause", syncUI);
    audio.addEventListener("timeupdate", syncUI);
    audio.addEventListener("ended", () => { if (g.__ttsAudio === audio)
        stopPlayback(); });
    await audio.play();
    syncUI();
}
// Returns true if there was active audio to pause/resume (caller should do nothing else);
// false if there's nothing playing (caller should start new playback).
export function togglePlayPause() {
    const audio = g.__ttsAudio;
    if (!audio)
        return false;
    if (audio.paused)
        audio.play();
    else
        audio.pause();
    return true;
}
export function isPlaying() {
    return !!g.__ttsAudio;
}

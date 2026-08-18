// Encode one or more mono/stereo PCM chunks (e.g. sentence + silence gap) into a single WAV blob.
export function pcmToWav(chunks) {
    const numChannels = chunks[0]?.numChannels ?? 1;
    const sampleRate = chunks[0]?.sampleRate ?? 22050;
    const totalSamples = chunks.reduce((n, c) => n + c.samples.length, 0);
    let peak = 0;
    for (const c of chunks)
        for (const s of c.samples) {
            const a = Math.abs(s);
            if (a > peak)
                peak = a;
        }
    const scale = 1 / Math.max(0.01, peak);
    const pcm16 = new Int16Array(totalSamples);
    let offset = 0;
    for (const c of chunks)
        for (const s of c.samples) {
            pcm16[offset++] = Math.max(-32768, Math.min(32767, Math.round(s * scale * 32767)));
        }
    const blockAlign = numChannels * 2;
    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++)
        view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    new Int16Array(buffer, 44).set(pcm16);
    return new Blob([buffer], { type: "audio/wav" });
}

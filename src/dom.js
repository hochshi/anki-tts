export function createStyle() {
    if (document.getElementById("ttsStyle"))
        return;
    const style = `
#ttsConfigContainer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: rgba(0, 0, 0, 0.35) 0px 8px 18px;
    z-index: 99999999999;
    width: 448px;
    max-width: 92vw;
    max-height: 85vh;
    overflow-y: auto;
    padding: 14px 16px;
    text-align: left;
    border-radius: 10px;
    background: Canvas;
    color: CanvasText;
    border: 1px solid rgba(128, 128, 128, .25);
}

#ttsButtonContainer {
    margin: 10px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

#ttsSettingsContainer {
    margin: 10px 0;
}

/* The progress bar used to be its own full-width block straight under the
   button row (it lived outside #ttsButtonContainer). Now it's inside the same
   flex row as Play/Stop so the whole group can hide as one unit (see
   syncUI() in player.ts) — flex-basis: 100% keeps it on its own line under
   the buttons instead of squeezing into the leftover row width. */
#ttsPlaybackProgress {
    flex-basis: 100%;
}

#ttsButtonContainer button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid rgba(128, 128, 128, .4);
    border-radius: 6px;
    cursor: pointer;
    background: Canvas;
    color: CanvasText;
    font-size: 13px;
}

#ttsButtonContainer button:hover {
    background: rgba(128, 128, 128, .12);
}

#localeSelect, #voiceSelect, #providerSelect, #speakerSelect, #relayUrlInput, #relayTokenInput {
    width: 100%;
    padding: 6px;
    margin: 4px 0 2px;
    box-sizing: border-box;
    border-radius: 5px;
    border: 1px solid rgba(128, 128, 128, .4);
    background: Canvas;
    color: CanvasText;
    font: inherit;
}

#relayRow label {
    font-weight: 400;
    font-size: 11.5px;
    opacity: .75;
    margin: 8px 0 0;
}

#closeBtn {
    float: right;
    cursor: pointer;
    opacity: .6;
    padding: 2px;
    border-radius: 4px;
}

#closeBtn:hover {
    opacity: 1;
    background: rgba(128, 128, 128, .15);
}

#ttsStatus {
    font-size: 12px;
    opacity: .75;
    min-height: 16px;
    margin-top: 6px;
}

#ttsProgress {
    width: 100%;
    display: none;
    margin: 4px 0;
}

#ttsStopButton {
    display: none;
}

#ttsPlaybackProgress {
    display: none;
    width: 100%;
    height: 6px;
    margin-top: 4px;
    accent-color: currentColor;
}

label {
    display: block;
    margin: 12px 0 2px;
    font-weight: 600;
    font-size: 13px;
}

#ttsLogSection {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid rgba(128, 128, 128, .25);
}

#ttsLogToggleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
}

#ttsLogTitle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 13px;
}

#ttsLogControls {
    display: flex;
    align-items: center;
    gap: 4px;
}

#ttsLogChevron {
    transition: transform .15s ease;
}

#ttsLogSection.open #ttsLogChevron {
    transform: rotate(180deg);
}

#clearLogBtn {
    display: inline-flex;
    align-items: center;
    padding: 3px;
    border-radius: 4px;
    cursor: pointer;
    opacity: .6;
    background: none;
    border: none;
    color: inherit;
}

#clearLogBtn:hover {
    opacity: 1;
    background: rgba(128, 128, 128, .15);
}

#ttsLogBody {
    display: none;
    margin-top: 8px;
}

#ttsLogPanel {
    max-height: 220px;
    overflow-y: auto;
    background: rgba(128, 128, 128, .08);
    border-radius: 6px;
    padding: 6px 8px;
}

.ttsLogEmpty {
    opacity: .5;
    font-size: 11.5px;
    padding: 4px 2px;
}

.ttsLogLine {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 2px;
    border-bottom: 1px solid rgba(128, 128, 128, .1);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.4;
}

.ttsLogLine:last-child {
    border-bottom: none;
}

.ttsLogTime {
    flex-shrink: 0;
    opacity: .45;
}

.ttsLogBadge {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .03em;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(128, 128, 128, .18);
}

.ttsLogLine.warn .ttsLogBadge {
    background: rgba(201, 153, 0, .2);
    color: #c99500;
}

.ttsLogLine.error .ttsLogBadge {
    background: rgba(230, 51, 51, .18);
    color: #e33;
}

.ttsLogLine.error .ttsLogMsg {
    color: #e33;
}

.ttsLogMsg {
    word-break: break-word;
    white-space: pre-wrap;
}`;
    const styleElement = document.createElement("style");
    styleElement.id = "ttsStyle";
    styleElement.innerHTML = style;
    document.head.appendChild(styleElement);
}
export function el(tag, attributes, text, parent) {
    const existing = attributes.id && document.getElementById(attributes.id);
    if (existing)
        return existing;
    const element = document.createElement(tag);
    for (const key in attributes)
        element.setAttribute(key, attributes[key]);
    if (text)
        element.appendChild(document.createTextNode(text));
    if (parent)
        parent.appendChild(element);
    return element;
}
// Feather Icons (MIT) glyphs, inlined so the addon script has zero image/font assets to fetch.
const ICON_PATHS = {
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    stop: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'
};
export function icon(name, extraAttrs = "") {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs}>${ICON_PATHS[name]}</svg>`;
}

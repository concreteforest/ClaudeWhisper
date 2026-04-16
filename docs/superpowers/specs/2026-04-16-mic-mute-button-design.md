# Mic Mute Button — Design Spec
**Date:** 2026-04-16
**Project:** ClaudeWhisper (feature/claude-backend)
**Scope:** `frontend-new/index.html` only

---

## Problem

After the wake word fires, ambient sounds (typing, background noise) are picked up and sent to the backend, causing Claude to respond to non-speech input. This produces short garbage responses that push useful chat history out of view.

## Solution

Add a manual mic mute toggle button to the titlebar. When muted, audio streaming to the backend is fully suppressed. The mute state persists until manually toggled off — no auto-unmute on conversation end.

---

## UI

A second icon button `#mic-btn` is added to the titlebar, to the left of the existing audio mute button `#mute-btn`:

```
[ • Ready          🎙️  🔊 ]
```

**States:**
- **Mic on** (default): `🎙️`, normal opacity (`0.55`), matching existing button style
- **Mic muted**: `🎙️`, red-tinted background (`rgba(239,68,68,0.25)`), opacity `1` — clearly "blocked" rather than just dimmed

**CSS:** Same pattern as `#mute-btn`. `-webkit-app-region: no-drag` so clicks register through the draggable titlebar.

---

## Logic

### New state
```js
let micMuted = false;
```

### Toggle handler
```js
$micBtn.addEventListener('click', () => {
  micMuted = !micMuted;
  $micBtn.classList.toggle('mic-muted', micMuted);
  if (micMuted) {
    stopMicStreaming();
  } else if (currentState === 'idle') {
    startMicStreaming();
  }
});
```

### Guard in `startMicStreaming()`
```js
async function startMicStreaming() {
  if (micMuted) return;   // <-- add this line
  if (micStream) return;
  // ... rest unchanged
}
```

### Why this is sufficient
All existing callers of `startMicStreaming()` — WebSocket open, `conversation-chain-end`, `start-mic` control message — automatically respect the mute with no further changes. The flag persists across conversations because nothing clears it.

---

## Files Changed

- `frontend-new/index.html` — only file modified (all frontend logic lives here)

## Files Not Changed

- `frontend-new/src/logic.js` — pure logic module used by tests; mic mute is UI state, not tested here
- Backend Python files — no backend changes needed; backend simply receives no audio when muted

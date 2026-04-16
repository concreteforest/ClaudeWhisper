# Mic Mute Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent mic mute toggle button to the ClaudeWhisper titlebar that fully stops audio streaming to the backend until manually toggled off.

**Architecture:** All changes are in the single inline-script HTML file `frontend-new/index.html`. A `micMuted` boolean flag is checked at the top of `startMicStreaming()` so all existing callers (WebSocket open, `conversation-chain-end`, `start-mic`) automatically respect the mute without modification.

**Tech Stack:** Plain HTML/CSS/JS, Electron (no build step)

---

### Task 1: Add mic button HTML and CSS

**Files:**
- Modify: `frontend-new/index.html`

- [ ] **Step 1: Add the button element to the titlebar**

In `index.html`, find the titlebar div (around line 197-201):
```html
<div id="titlebar">
  <span id="status-dot"></span>
  <span id="status-label">Ready</span>
  <button id="mute-btn" title="Toggle mute">🔊</button>
</div>
```

Replace with:
```html
<div id="titlebar">
  <span id="status-dot"></span>
  <span id="status-label">Ready</span>
  <button id="mic-btn" title="Toggle mic">🎙️</button>
  <button id="mute-btn" title="Toggle mute">🔊</button>
</div>
```

- [ ] **Step 2: Add CSS for `#mic-btn` and its muted state**

In `index.html`, find the `#mute-btn` CSS block (around line 63-76):
```css
#mute-btn {
  font-size: 13px;
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  -webkit-app-region: no-drag;
  opacity: 0.55;
  transition: opacity 0.15s;
}
#mute-btn:hover { opacity: 1; }
#mute-btn.muted  { opacity: 1; }
```

Add immediately after it:
```css
#mic-btn {
  font-size: 13px;
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  -webkit-app-region: no-drag;
  opacity: 0.55;
  transition: opacity 0.15s, background 0.15s;
}
#mic-btn:hover { opacity: 1; }
#mic-btn.mic-muted {
  opacity: 1;
  background: rgba(239, 68, 68, 0.25);
}
```

- [ ] **Step 3: Reload and verify button appears**

Press **Cmd+R** in the Electron window (or restart via `./launch.sh`).

Expected: 🎙️ appears in the titlebar to the left of 🔊. Both buttons are visible and similarly styled.

- [ ] **Step 4: Commit**

```bash
git -C .worktrees/feature/claude-backend add frontend-new/index.html
git -C .worktrees/feature/claude-backend commit -m "feat: add mic mute button HTML and CSS to titlebar"
```

---

### Task 2: Add mic mute JS logic

**Files:**
- Modify: `frontend-new/index.html`

- [ ] **Step 1: Add DOM reference and `micMuted` flag**

In `index.html`, find the DOM references block (around line 213-219):
```js
const $statusLabel = document.getElementById('status-label');
const $messages    = document.getElementById('messages');
const $errorBanner = document.getElementById('error-banner');
const $textInput   = document.getElementById('text-input');
const $sendBtn     = document.getElementById('send-btn');
const $muteBtn     = document.getElementById('mute-btn');
```

Replace with:
```js
const $statusLabel = document.getElementById('status-label');
const $messages    = document.getElementById('messages');
const $errorBanner = document.getElementById('error-banner');
const $textInput   = document.getElementById('text-input');
const $sendBtn     = document.getElementById('send-btn');
const $muteBtn     = document.getElementById('mute-btn');
const $micBtn      = document.getElementById('mic-btn');
```

And find the Mute section where `muted` and `currentSource` are declared (around line 289-290):
```js
let muted         = false;
let currentSource = null;
```

Add `micMuted` alongside it:
```js
let muted         = false;
let micMuted      = false;
let currentSource = null;
```

- [ ] **Step 2: Add the mic button click handler**

Find the existing mute button click handler (around line 292-299):
```js
$muteBtn.addEventListener('click', () => {
  muted = !muted;
  $muteBtn.textContent = muted ? '🔇' : '🔊';
  $muteBtn.classList.toggle('muted', muted);
  if (muted && currentSource) {
    try { currentSource.stop(); } catch (_e) {}
    currentSource = null;
  }
});
```

Add the mic button handler immediately after:
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

- [ ] **Step 3: Add guard to `startMicStreaming()`**

Find the `startMicStreaming` function (around line 494):
```js
async function startMicStreaming() {
  if (micStream) return;
```

Replace with:
```js
async function startMicStreaming() {
  if (micMuted) return;
  if (micStream) return;
```

- [ ] **Step 4: Reload and verify**

Press **Cmd+R** in the Electron window.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/feature/claude-backend add frontend-new/index.html
git -C .worktrees/feature/claude-backend commit -m "feat: wire mic mute flag and toggle handler"
```

---

### Task 3: Acceptance test

**Files:** none — verification only

Run through each scenario manually with the app running via `./launch.sh`:

- [ ] **Button appears**: 🎙️ shows in titlebar left of 🔊

- [ ] **Mute suppresses input**: Click 🎙️ → button gets red tint. Make noise or type loudly. Status dot stays grey, no "Listening…" state, Claude does not respond.

- [ ] **Wake word ignored while muted**: Say "hey claude" while muted. Backend receives no audio — no response.

- [ ] **Mute persists across conversation cycle**: Start a conversation (via text input), let Claude respond, confirm mic stays muted after `conversation-chain-end`.

- [ ] **Unmute resumes mic**: Click 🎙️ again → red tint clears, status goes to "Listening…" on voice input, Claude responds normally.

- [ ] **Audio mute unaffected**: Verify 🔊/🔇 still works independently of mic mute.

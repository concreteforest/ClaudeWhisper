'use strict';

// ---------------------------------------------------------------------------
// createStateMachine
// ---------------------------------------------------------------------------
function createStateMachine() {
  let state = 'idle';
  const listeners = [];

  return {
    getState: () => state,
    setState(newState) {
      state = newState;
      listeners.forEach((fn) => fn(newState));
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}

// ---------------------------------------------------------------------------
// createAudioQueue
// ---------------------------------------------------------------------------
function createAudioQueue({ onPlaybackComplete }) {
  const items = [];
  let playing = false;
  let synthComplete = false;

  function checkDrainComplete() {
    if (synthComplete && items.length === 0 && !playing) {
      synthComplete = false; // reset so it doesn't fire twice
      onPlaybackComplete();
    }
  }

  return {
    length: () => items.length,
    isPlaying: () => playing,
    enqueue(item) {
      items.push(item);
    },
    dequeue() {
      return items.shift() ?? null;
    },
    setPlaying(val) {
      playing = val;
    },
    signalBackendSynthComplete() {
      synthComplete = true;
      checkDrainComplete();
    },
    checkDrainComplete,
    reset() {
      items.length = 0;
      playing = false;
      synthComplete = false;
    },
  };
}

// ---------------------------------------------------------------------------
// createMessageHandler
// ---------------------------------------------------------------------------
function createMessageHandler({ sm, queue, transcript, response, onStartMic }) {
  const handlers = {
    control(msg) {
      switch (msg.text) {
        case 'conversation-chain-start':
          sm.setState('thinking');
          transcript.set('');
          response.set('');
          break;
        case 'start-mic':
          sm.setState('idle');
          onStartMic();
          break;
        case 'conversation-chain-end':
          sm.setState('idle');
          break;
        case 'backend-synth-complete':
          queue.signalBackendSynthComplete();
          break;
        default:
          break;
      }
    },
    'full-text'(msg) {
      response.set(msg.text);
    },
    'user-input-transcription'(msg) {
      transcript.set(msg.text);
    },
    audio(msg) {
      queue.enqueue({ audio: msg.audio, text: msg.text });
    },
  };

  return {
    handle(msg) {
      const fn = handlers[msg.type];
      if (fn) fn(msg);
    },
  };
}

// ---------------------------------------------------------------------------
// createSilenceDetector
// ---------------------------------------------------------------------------
function createSilenceDetector({ threshold, silenceDurationMs, onSilence }) {
  let activated = false; // speech has been heard at least once
  let silenceTimer = null;
  let fired = false;

  function clearTimer() {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  return {
    processSample(rms) {
      if (rms >= threshold) {
        // Speech detected
        activated = true;
        fired = false;
        clearTimer();
      } else {
        // Silence
        if (activated && !fired && silenceTimer === null) {
          silenceTimer = setTimeout(() => {
            if (!fired) {
              fired = true;
              silenceTimer = null;
              onSilence();
            }
          }, silenceDurationMs);
        }
      }
    },
    reset() {
      clearTimer();
      activated = false;
      fired = false;
    },
  };
}

module.exports = {
  createStateMachine,
  createAudioQueue,
  createMessageHandler,
  createSilenceDetector,
};

'use strict';

// These tests import from ../logic.js which does not exist yet.
// All tests should FAIL until logic.js is written.

const {
  createStateMachine,
  createAudioQueue,
  createMessageHandler,
  createSilenceDetector,
} = require('../logic');

// ---------------------------------------------------------------------------
// createStateMachine
// ---------------------------------------------------------------------------
describe('createStateMachine', () => {
  test('initial state is idle', () => {
    const sm = createStateMachine();
    expect(sm.getState()).toBe('idle');
  });

  test('setState transitions to the new state', () => {
    const sm = createStateMachine();
    sm.setState('listening');
    expect(sm.getState()).toBe('listening');
  });

  test('setState fires onChange callback with new state', () => {
    const sm = createStateMachine();
    const changes = [];
    sm.onChange((s) => changes.push(s));
    sm.setState('thinking');
    sm.setState('speaking');
    expect(changes).toEqual(['thinking', 'speaking']);
  });

  test('setState to same state still fires onChange', () => {
    const sm = createStateMachine();
    const changes = [];
    sm.onChange((s) => changes.push(s));
    sm.setState('idle');
    expect(changes).toEqual(['idle']);
  });
});

// ---------------------------------------------------------------------------
// createAudioQueue
// ---------------------------------------------------------------------------
describe('createAudioQueue', () => {
  test('queue starts empty and not playing', () => {
    const q = createAudioQueue({ onPlaybackComplete: jest.fn() });
    expect(q.length()).toBe(0);
    expect(q.isPlaying()).toBe(false);
  });

  test('enqueue adds items', () => {
    const q = createAudioQueue({ onPlaybackComplete: jest.fn() });
    q.enqueue({ audio: 'aaa', text: 'hello' });
    q.enqueue({ audio: 'bbb', text: 'world' });
    expect(q.length()).toBe(2);
  });

  test('dequeue removes and returns item in FIFO order', () => {
    const q = createAudioQueue({ onPlaybackComplete: jest.fn() });
    q.enqueue({ audio: 'first', text: 'f' });
    q.enqueue({ audio: 'second', text: 's' });
    expect(q.dequeue()).toEqual({ audio: 'first', text: 'f' });
    expect(q.length()).toBe(1);
  });

  test('dequeue from empty queue returns null', () => {
    const q = createAudioQueue({ onPlaybackComplete: jest.fn() });
    expect(q.dequeue()).toBeNull();
  });

  test('setPlaying updates isPlaying flag', () => {
    const q = createAudioQueue({ onPlaybackComplete: jest.fn() });
    q.setPlaying(true);
    expect(q.isPlaying()).toBe(true);
    q.setPlaying(false);
    expect(q.isPlaying()).toBe(false);
  });

  // Race condition: backend-synth-complete arrives AFTER queue drains
  test('signalBackendSynthComplete fires onPlaybackComplete immediately when queue empty and not playing', () => {
    const cb = jest.fn();
    const q = createAudioQueue({ onPlaybackComplete: cb });
    // Queue empty, not playing
    q.signalBackendSynthComplete();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // Race condition: backend-synth-complete arrives BEFORE queue drains
  test('signalBackendSynthComplete does NOT fire onPlaybackComplete when queue has items', () => {
    const cb = jest.fn();
    const q = createAudioQueue({ onPlaybackComplete: cb });
    q.enqueue({ audio: 'x', text: 'y' });
    q.signalBackendSynthComplete();
    expect(cb).not.toHaveBeenCalled();
  });

  test('signalBackendSynthComplete does NOT fire onPlaybackComplete when currently playing', () => {
    const cb = jest.fn();
    const q = createAudioQueue({ onPlaybackComplete: cb });
    q.setPlaying(true);
    q.signalBackendSynthComplete();
    expect(cb).not.toHaveBeenCalled();
  });

  test('checkDrainComplete fires onPlaybackComplete when synthComplete is already set', () => {
    const cb = jest.fn();
    const q = createAudioQueue({ onPlaybackComplete: cb });
    // Simulate: backend-synth-complete arrived first
    q.signalBackendSynthComplete(); // fires immediately (queue empty, not playing) — not what we want to test
    // Reset: enqueue, drain, then check
    const cb2 = jest.fn();
    const q2 = createAudioQueue({ onPlaybackComplete: cb2 });
    q2.enqueue({ audio: 'x', text: 'y' });
    q2.signalBackendSynthComplete(); // arrives while item in queue — should NOT fire
    expect(cb2).not.toHaveBeenCalled();
    q2.dequeue();            // consume item
    q2.setPlaying(false);    // playback done
    q2.checkDrainComplete(); // queue now empty, synthComplete already set
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  test('reset clears queue, playing state, and synthComplete flag', () => {
    const cb = jest.fn();
    const q = createAudioQueue({ onPlaybackComplete: cb });
    q.enqueue({ audio: 'x', text: 'y' });
    q.setPlaying(true);
    q.reset();
    expect(q.length()).toBe(0);
    expect(q.isPlaying()).toBe(false);
    // After reset, signalBackendSynthComplete should fire callback (fresh state)
    q.signalBackendSynthComplete();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// createMessageHandler
// ---------------------------------------------------------------------------
describe('createMessageHandler', () => {
  let sm, queue, transcript, response, onStartMic;

  beforeEach(() => {
    sm = createStateMachine();
    queue = createAudioQueue({ onPlaybackComplete: jest.fn() });
    transcript = { set: jest.fn() };
    response = { set: jest.fn() };
    onStartMic = jest.fn();
  });

  function makeHandler() {
    return createMessageHandler({ sm, queue, transcript, response, onStartMic });
  }

  test('conversation-chain-start sets state to thinking and clears display', () => {
    const h = makeHandler();
    h.handle({ type: 'control', text: 'conversation-chain-start' });
    expect(sm.getState()).toBe('thinking');
    expect(transcript.set).toHaveBeenCalledWith('');
    expect(response.set).toHaveBeenCalledWith('');
  });

  test('start-mic sets state to idle and calls onStartMic', () => {
    const h = makeHandler();
    sm.setState('thinking');
    h.handle({ type: 'control', text: 'start-mic' });
    expect(sm.getState()).toBe('idle');
    expect(onStartMic).toHaveBeenCalledTimes(1);
  });

  test('conversation-chain-end sets state to idle', () => {
    const h = makeHandler();
    sm.setState('speaking');
    h.handle({ type: 'control', text: 'conversation-chain-end' });
    expect(sm.getState()).toBe('idle');
  });

  test('full-text message updates response', () => {
    const h = makeHandler();
    h.handle({ type: 'full-text', text: 'Hello world' });
    expect(response.set).toHaveBeenCalledWith('Hello world');
  });

  test('user-input-transcription updates transcript', () => {
    const h = makeHandler();
    h.handle({ type: 'user-input-transcription', text: 'Hey claude' });
    expect(transcript.set).toHaveBeenCalledWith('Hey claude');
  });

  test('audio message enqueues item with audio and text fields', () => {
    const h = makeHandler();
    h.handle({ type: 'audio', audio: 'base64data==', text: 'spoken text' });
    expect(queue.length()).toBe(1);
    const item = queue.dequeue();
    expect(item.audio).toBe('base64data==');
    expect(item.text).toBe('spoken text');
  });

  test('backend-synth-complete signals queue synthComplete', () => {
    const cb = jest.fn();
    const q2 = createAudioQueue({ onPlaybackComplete: cb });
    // Queue is empty — signaling should fire callback
    const h = createMessageHandler({ sm, queue: q2, transcript, response, onStartMic });
    h.handle({ type: 'control', text: 'backend-synth-complete' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('unknown message types are ignored without error', () => {
    const h = makeHandler();
    expect(() => h.handle({ type: 'live2d-config', data: {} })).not.toThrow();
    expect(() => h.handle({ type: 'unknown-type' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createSilenceDetector
// ---------------------------------------------------------------------------
describe('createSilenceDetector', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('does not fire callback when RMS is above threshold', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    det.processSample(0.05); // above threshold
    jest.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  test('fires callback after silence duration of low-RMS samples', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    det.processSample(0.05); // speech detected first
    det.processSample(0.001); // silence starts
    jest.advanceTimersByTime(1500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('does not fire if silence window is reset by speech', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    det.processSample(0.05);  // speech
    det.processSample(0.001); // silence starts
    jest.advanceTimersByTime(700);
    det.processSample(0.05);  // speech again — resets timer
    jest.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
  });

  test('does not fire callback if speech never detected (no activation)', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    // Only silence from the start — no prior speech activation
    det.processSample(0.001);
    jest.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  test('fires callback only once per activation', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    det.processSample(0.05);  // activate
    det.processSample(0.001); // silence
    jest.advanceTimersByTime(1500);
    jest.advanceTimersByTime(1500); // extra time
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('reset allows re-activation', () => {
    const cb = jest.fn();
    const det = createSilenceDetector({ threshold: 0.012, silenceDurationMs: 1500, onSilence: cb });
    det.processSample(0.05);
    det.processSample(0.001);
    jest.advanceTimersByTime(1500);
    expect(cb).toHaveBeenCalledTimes(1);

    det.reset();
    det.processSample(0.05);  // new activation
    det.processSample(0.001); // silence again
    jest.advanceTimersByTime(1500);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

import { getAircraft } from "./aircrafts.js";

const PROFILES = Object.freeze({
  "al-182": { base: 58, range: 84, detail: 2.02, volume: 0.18, filter: 720, wind: 0.08 },
  "vt-12": { base: 72, range: 126, detail: 2.45, volume: 0.18, filter: 940, wind: 0.1 },
  "sj-42": { base: 92, range: 210, detail: 1.51, volume: 0.15, filter: 1350, wind: 0.15 },
  "fx-19": { base: 105, range: 330, detail: 1.38, volume: 0.17, filter: 1850, wind: 0.2 },
  "ufo-x1": { base: 42, range: 520, detail: 1.618, volume: 0.14, filter: 2400, wind: 0.16 },
});

const setTarget = (parameter, value, now, speed = 0.06) => {
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, speed);
};

export class FlightAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engine = null;
    this.detail = null;
    this.noise = null;
    this.engineFilter = null;
    this.windFilter = null;
    this.windGain = null;
    this.pan = null;
    this.sources = [];
    this.nodes = [];
    this.profile = PROFILES["al-182"];
    this.aircraftId = "al-182";
    this.muted = false;
    this.paused = false;
    this.active = false;
    this.graphVersion = 0;
  }

  async start(aircraftId) {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return false;
    this.context ??= new AudioContextClass();
    await this.context.resume();
    this.graphVersion += 1;
    this.destroyGraph();

    this.aircraftId = getAircraft(aircraftId).id;
    this.profile = PROFILES[this.aircraftId] ?? PROFILES["al-182"];
    const ctx = this.context;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.22;
    this.master.connect(compressor).connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = this.profile.filter;
    this.engineFilter.Q.value = 1.1;
    this.pan = ctx.createStereoPanner();
    this.engineFilter.connect(this.pan).connect(this.master);

    this.engine = ctx.createOscillator();
    this.engine.type = this.aircraftId === "ufo-x1" ? "sine" : "sawtooth";
    this.engine.frequency.value = this.profile.base;
    this.engine.connect(this.engineFilter);

    this.detail = ctx.createOscillator();
    this.detail.type = this.aircraftId === "fx-19" ? "square" : "triangle";
    this.detail.frequency.value = this.profile.base * this.profile.detail;
    const detailGain = ctx.createGain();
    detailGain.gain.value = this.aircraftId === "ufo-x1" ? 0.22 : 0.08;
    this.detail.connect(detailGain).connect(this.engineFilter);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = this.aircraftId === "ufo-x1" ? 4.2 : 9.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = this.aircraftId === "ufo-x1" ? 13 : 3.5;
    lfo.connect(lfoGain).connect(this.engine.frequency);

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1) {
      noiseData[index] = Math.random() * 2 - 1;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 850;
    this.windFilter.Q.value = 0.72;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);

    this.sources = [this.engine, this.detail, lfo, this.noise];
    this.nodes = [compressor, this.engineFilter, this.pan, detailGain, lfoGain, this.windFilter, this.windGain];
    this.sources.forEach((source) => source.start());
    this.active = true;
    setTarget(this.master.gain, this.muted ? 0.0001 : this.profile.volume * 0.55, ctx.currentTime, 0.12);
    return true;
  }

  update(state) {
    if (!this.active || !this.context || !this.master || !state) return;
    const now = this.context.currentTime;
    const aircraft = getAircraft(this.aircraftId);
    const speedRatio = Math.min(1.4, state.speed / Math.max(1, aircraft.maxSpeed));
    const throttle = Math.max(0, Math.min(1, state.throttle));
    const power = 0.2 + throttle * 0.8;
    const frequency = this.profile.base + this.profile.range * (throttle * 0.76 + speedRatio * 0.24);

    setTarget(this.engine.frequency, frequency, now, 0.055);
    setTarget(this.detail.frequency, frequency * this.profile.detail, now, 0.07);
    setTarget(this.engineFilter.frequency, this.profile.filter + throttle * 1900, now, 0.08);
    setTarget(this.windFilter.frequency, 520 + speedRatio * 2200, now, 0.1);
    setTarget(this.windGain.gain, state.airborne ? this.profile.wind * speedRatio : 0.01, now, 0.1);
    setTarget(this.pan.pan, Math.max(-0.42, Math.min(0.42, state.roll / 100)), now, 0.08);
    const targetVolume = this.muted ? 0.0001 : this.paused ? 0.015 : this.profile.volume * power;
    setTarget(this.master.gain, targetVolume, now, 0.08);
  }

  cue(name) {
    if (!this.context || !this.master || this.muted) return;
    const tones = {
      takeoff: [520, 740, 0.2, "sine"],
      landed: [720, 520, 0.32, "sine"],
      crashed: [105, 42, 0.55, "sawtooth"],
      autopilot: [660, 880, 0.15, "sine"],
      screenshot: [980, 1220, 0.09, "triangle"],
      stall: [920, 720, 0.24, "square"],
      sonic: [68, 34, 0.5, "sawtooth"],
    };
    const [from, to, duration, type] = tones[name] ?? tones.autopilot;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(name === "crashed" || name === "sonic" ? 0.2 : 0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.context && this.master) {
      const target = this.muted ? 0.0001 : this.profile.volume * 0.65;
      setTarget(this.master.gain, target, this.context.currentTime, 0.04);
    }
    return this.muted;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (this.context && this.master) {
      const target = this.muted ? 0.0001 : this.paused ? 0.015 : this.profile.volume * 0.65;
      setTarget(this.master.gain, target, this.context.currentTime, 0.06);
    }
  }

  stop() {
    if (this.context && this.master) {
      setTarget(this.master.gain, 0.0001, this.context.currentTime, 0.04);
    }
    const version = ++this.graphVersion;
    window.setTimeout(() => {
      if (this.graphVersion === version) this.destroyGraph();
    }, 180);
  }

  destroyGraph() {
    this.sources.forEach((source) => {
      try { source.stop(); } catch { /* déjà arrêté */ }
      try { source.disconnect(); } catch { /* déjà déconnecté */ }
    });
    this.nodes.forEach((node) => {
      try { node.disconnect(); } catch { /* déjà déconnecté */ }
    });
    try { this.master?.disconnect(); } catch { /* déjà déconnecté */ }
    this.sources = [];
    this.nodes = [];
    this.active = false;
  }
}

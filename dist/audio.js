/* Gesture-started, position-aware sound for JASHI. Voices are nonverbal synthesis. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Matches the camera: forward=(-sin(yaw),-cos(yaw)), right=(cos(yaw),-sin(yaw)). */
export function audioSpatial(listener, source, { occluded = false, range = 34 } = {}) {
  if (!listener || !source || !Number.isFinite(source.x) || !Number.isFinite(source.z))
    return { pan: 0, gain: 1, cutoff: 20000, distance: 0 };
  const dx = source.x - (Number(listener.x) || 0), dz = source.z - (Number(listener.z) || 0);
  const sourceY = Number.isFinite(source.y) ? source.y : (Number(source.level) || 0) * 3.35;
  const listenerY = Number.isFinite(listener.y) ? listener.y : (Number(listener.level) || 0) * 3.35;
  const dy = sourceY - listenerY, planar = Math.hypot(dx, dz), distance = Math.hypot(planar, dy);
  const yaw = Number.isFinite(listener.yaw) ? listener.yaw : 0;
  const pan = planar < .01 ? 0 : clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / planar, -.9, .9);
  const rear = planar < .01 ? 0 : Math.max(0, (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / planar);
  const elevation = Math.abs(dy) > 1.8;
  const gain = Math.pow(clamp(1 - distance / Math.max(1, range), 0, 1), 1.15)
    / (1 + distance * .035) * (occluded ? .31 : 1) * (elevation ? .78 : 1);
  const cutoff = occluded ? 460 : elevation ? 1450 : clamp(6900 - distance * 120 - rear * 2000, 1100, 6900);
  return { pan, gain, cutoff, distance };
}

export class Soundscape {
  constructor() {
    this.volume = 0.45;
    this.muted = false;
    this.context = null;
    this._starting = null;
    this._ready = false;
    this._disposed = false;
    this._voices = new Set();
    this._continuous = [];
    this._cooldowns = new Map();
    this._nextStep = 0;
    this._nextBeat = 0;
    this._monsterStride = 0;
    this._monsterStepLength = 0.98;
    this._nextSong = 5;
    this._nextBreath = 0;
    this._monsterSide = 1;
    this._huntDuckedUntil = 0;
    this._staminaScale = 1;
    this._lastUpdate = -1;
    this._lastGameTime = -1;
    this._stepSide = 1;
    this._listener = null;
    this._monster = null;
    this._occluded = false;
    this._cueSpatial = null;
    this._nextCreatureBreath = 2;
    this._nextTimber = 9;
    this._radio = { active: false, signal: 0, staticLevel: 1 };
    this._guideBuffers = new Map();
    this._guideToken = 0;
    this._guideVoice = null;
    this._lastRadioUpdate = -1;
    this._onVisibility = () => { if(this._hidden())this.stopGuideVoice();this._syncMaster(); };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  /** Call directly from the start/resume button's user gesture. */
  async start() {
    if (this._disposed) return false;
    if (this._starting) return this._starting;
    this._starting = this._start();
    try { return await this._starting; }
    finally { this._starting = null; }
  }

  get guidePlaying(){ return !!this._guideVoice; }
  stopGuideVoice(){
    this._guideToken++;
    const voice=this._guideVoice;this._guideVoice=null;
    if(voice){voice.source.onended=null;try{voice.source.stop();}catch{}for(const node of voice.nodes)node.disconnect();}
  }
  async playGuideVoice(url,onEnded){
    this.stopGuideVoice();const token=this._guideToken;
    if(this.muted||this.volume===0||this._hidden())return 'muted';
    if(!await this.start())return 'error';
    try{
      let buffer=this._guideBuffers.get(url);
      if(!buffer){
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('voice unavailable');
        buffer=await this.context.decodeAudioData(await response.arrayBuffer());
        this._guideBuffers.set(url,buffer);
      }
      if(token!==this._guideToken||this._disposed||this.muted||this._hidden())return 'cancelled';
      const source=this.context.createBufferSource();source.buffer=buffer;
      const high=this.context.createBiquadFilter();high.type='highpass';high.frequency.value=230;
      const low=this.context.createBiquadFilter();low.type='lowpass';low.frequency.value=3700;
      const gain=this.context.createGain();gain.gain.value=.85;
      source.connect(high);high.connect(low);low.connect(gain);gain.connect(this._compressor);
      const voice={source,nodes:[source,high,low,gain]};this._guideVoice=voice;
      source.onended=()=>{for(const node of voice.nodes)node.disconnect();if(this._guideVoice===voice){this._guideVoice=null;onEnded?.();}};
      source.start();return 'playing';
    }catch{return token===this._guideToken?'error':'cancelled';}
  }

  async _start() {
    try {
      if (!this.context || this.context.state === 'closed') {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass({ latencyHint: 'interactive' });
        this._buildGraph();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this._disposed) return false;
      this._ready = this.context.state === 'running';
      this._syncMaster();
      return this._ready;
    } catch {
      // Browser audio restrictions must never prevent the game from starting.
      this._ready = false;
      return false;
    }
  }

  _buildGraph() {
    const ctx = this.context;
    this._master = ctx.createGain();
    this._master.gain.value = 0;
    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -16;
    this._compressor.knee.value = 12;
    this._compressor.ratio.value = 6;
    this._compressor.attack.value = 0.008;
    this._compressor.release.value = 0.22;
    this._effects = ctx.createGain();
    this._effects.gain.value = 0.8;
    this._effects.connect(this._compressor);
    this._compressor.connect(this._master);
    this._master.connect(ctx.destination);

    this._noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    let soft = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      soft = soft * 0.96 + white * 0.04;
      data[i] = white * 0.55 + soft * 1.3;
    }
    const windSource = ctx.createBufferSource();
    windSource.buffer = this._noiseBuffer;
    windSource.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 95;
    this._windFilter = ctx.createBiquadFilter();
    this._windFilter.type = 'lowpass';
    this._windFilter.frequency.value = 750;
    this._windGain = ctx.createGain();
    this._windGain.gain.value = 0.04;
    windSource.connect(high);
    high.connect(this._windFilter);
    this._windFilter.connect(this._windGain);
    this._windGain.connect(this._compressor);
    windSource.start();
    this._continuous.push(windSource, high, this._windFilter, this._windGain);

    this._airGain = this._drone(49, 'sine', 0.013);
    this._uneaseA = this._drone(109, 'sine', 0);
    this._uneaseB = this._drone(113.6, 'sine', 0);
    // High cedar needles and low wind occupy different bands; indoor air has no needles.
    const needles = ctx.createBufferSource(); needles.buffer = this._noiseBuffer; needles.loop = true;
    const needleFilter = ctx.createBiquadFilter(); needleFilter.type = 'bandpass'; needleFilter.frequency.value = 2700; needleFilter.Q.value = .45;
    this._needleGain = ctx.createGain(); this._needleGain.gain.value = 0;
    needles.connect(needleFilter); needleFilter.connect(this._needleGain); this._needleGain.connect(this._compressor); needles.start();
    this._continuous.push(needles, needleFilter, this._needleGain);
    // A tuner has a continuous noise floor and a heterodyne, rather than a repeated one-shot.
    const radio = ctx.createBufferSource(); radio.buffer = this._noiseBuffer; radio.loop = true;
    this._radioFilter = ctx.createBiquadFilter(); this._radioFilter.type = 'bandpass'; this._radioFilter.frequency.value = 1700; this._radioFilter.Q.value = .9;
    this._radioGain = ctx.createGain(); this._radioGain.gain.value = 0;
    radio.connect(this._radioFilter); this._radioFilter.connect(this._radioGain); this._radioGain.connect(this._effects); radio.start();
    this._radioTone = ctx.createOscillator(); this._radioTone.type = 'sine'; this._radioTone.frequency.value = 1500;
    this._radioToneGain = ctx.createGain(); this._radioToneGain.gain.value = 0;
    this._radioTone.connect(this._radioToneGain); this._radioToneGain.connect(this._effects); this._radioTone.start();
    this._continuous.push(radio, this._radioFilter, this._radioGain, this._radioTone, this._radioToneGain);
  }

  _drone(frequency, type, level) {
    const source = this.context.createOscillator();
    const gain = this.context.createGain();
    source.type = type;
    source.frequency.value = frequency;
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(this._compressor);
    source.start();
    this._continuous.push(source, gain);
    return gain;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if(this.muted)this.stopGuideVoice();
    this._syncMaster();
  }

  setVolume(value) {
    const number = Number(value);
    this.volume = Number.isFinite(number) ? clamp(number, 0, 1) : 0.45;
    this._syncMaster();
  }

  setRadioTuning(value = {}) {
    const wasActive = this._radio.active;
    this._radio = { active: Boolean(value?.active),
      signal: clamp(Number(value?.signal) || 0, 0, 1),
      staticLevel: Number.isFinite(value?.staticLevel) ? clamp(value.staticLevel, 0, 1) : 1 };
    if (!this._ready || !this._radioGain) return;
    if (wasActive === this._radio.active && this.context.currentTime - this._lastRadioUpdate < .05) return;
    this._lastRadioUpdate = this.context.currentTime;
    const { active, signal, staticLevel } = this._radio;
    this._smooth(this._radioGain.gain, active ? (.006 + (1 - signal) * .063) * staticLevel : 0, .055);
    this._smooth(this._radioFilter.frequency, 1050 + (1 - signal) * 1850, .08);
    this._smooth(this._radioToneGain.gain, active ? (1 - signal) * .009 : 0, .06);
    this._smooth(this._radioTone.frequency, 410 + (1 - signal) * 1980, .08);
  }

  _hidden() {
    return typeof document !== 'undefined' && document.hidden;
  }

  _syncMaster() {
    if (!this._master || !this.context || this.context.state === 'closed') return;
    // The final gain never exceeds 0.45, even at maximum UI volume.
    const level = this.muted || this._hidden() ? 0 : this.volume * 0.45;
    this._smooth(this._master.gain, level, 0.07);
  }

  _smooth(param, value, smoothing = 0.15) {
    try {
      const now = this.context.currentTime;
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
      else param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, smoothing);
    } catch { /* Audio can become unavailable while the page is backgrounded. */ }
  }

  update({ danger = 0, moving = false, running = false, inside = false, time = 0,
    stamina = 1, pursuit = false, monsterDistance = Infinity,
    enemyMode = 'dormant', enemySpeed = 0, listener, monster, occluded = false,
    surface = inside ? 'wood' : 'leaves', radioTuning, dialogue = false, paused = false } = {}) {
    if (listener) this._listener = listener;
    if (monster) this._monster = monster;
    this._occluded = Boolean(occluded);
    if (!this._ready || !this.context || this.context.state !== 'running') return;
    try {
      const d = Number.isFinite(danger) ? clamp(danger, 0, 1) : 0;
      const t = Number.isFinite(time) ? Math.max(0, time) : 0;
      const elapsed = this._lastGameTime < 0 ? 0 : clamp(t - this._lastGameTime, 0, 0.1);
      const staminaValue = Number.isFinite(stamina) ? stamina : 1;
      if (this._lastGameTime < 0 || t < this._lastGameTime) this._staminaScale = staminaValue > 1 ? 100 : 1;
      else if (staminaValue > 1) this._staminaScale = 100;
      const energy = clamp(staminaValue / this._staminaScale, 0, 1);
      const hunted = typeof pursuit === 'number' ? clamp(pursuit, 0, 1) : pursuit ? 1 : 0;
      const distance = Number.isFinite(monsterDistance) ? Math.max(0, monsterDistance) : Infinity;
      const presence = clamp((24 - distance) / 22, 0, 1);
      // A restarted run may reset its game clock without restarting audio.
      if (t < this._lastGameTime) {
        this._nextStep = this._nextBeat = t;
        this._monsterStride = 0;
        this._monsterStepLength = 0.98;
        this._nextSong = t + 4.5;
        this._nextBreath = t + 0.5;
        this._nextCreatureBreath = t + 2;
        this._nextTimber = t + 9;
      }
      this._lastGameTime = t;
      if (paused) {
        // The simulation may stop updating after this one call. Silence every
        // continuous layer now instead of leaving the previous danger mix held.
        this.setRadioTuning({ active: false, signal: 0, staticLevel: 0 });
        for (const node of [this._windGain, this._airGain, this._uneaseA, this._uneaseB, this._needleGain])
          if (node) this._smooth(node.gain, 0, .065);
        this._lastUpdate = -1; // The first resumed frame restores its actual mix.
        return;
      }
      if (radioTuning) this.setRadioTuning(radioTuning);
      if (this.muted || this._hidden() || this.volume === 0) return;
      const now = this.context.currentTime;
      // Parameter automation is limited to 20 Hz, independent of render FPS.
      if (now - this._lastUpdate >= 0.05) {
        this._lastUpdate = now;
        const breeze = 0.85 + Math.sin(t * 0.27) * 0.11 + Math.sin(t * 0.73) * 0.04;
        const duck = (now < this._huntDuckedUntil ? 0.18 : 1) * (dialogue ? .48 : 1);
        this._smooth(this._windGain.gain, (inside ? 0.013 : 0.046) * breeze * duck, 0.35);
        this._smooth(this._windFilter.frequency, inside ? 380 : 700 + Math.sin(t * 0.18) * 130, 0.4);
        this._smooth(this._airGain.gain, (inside ? 0.011 : 0.015) * duck, 0.4);
        this._smooth(this._uneaseA.gain, (d * d * 0.022 + hunted * 0.006) * duck, 0.25);
        this._smooth(this._uneaseB.gain, (d * d * 0.016 + hunted * 0.004) * duck, 0.25);
        this._smooth(this._needleGain.gain, inside ? 0 : (.006 + Math.max(0, Math.sin(t * .21)) * .008) * duck, .6);
      }
      if (moving && t >= this._nextStep) {
        this._nextStep = t + (running ? 0.29 : 0.49) * (0.97 + Math.random() * 0.06);
        this._stepSide *= -1;
        this._footstep(surface, running, this._stepSide);
      } else if (!moving) {
        this._nextStep = t + 0.06;
      }
      if (d > 0.12 && t >= this._nextBeat) {
        this._nextBeat = t + 1.1 - d * 0.53;
        const level = 0.018 + d * 0.036;
        this._tone({ frequency: 65, endFrequency: 39, duration: 0.13, gain: level });
        this._tone({ frequency: 57, endFrequency: 34, duration: 0.12, gain: level * 0.66, delay: 0.17 });
      } else if (d <= 0.12) {
        this._nextBeat = t + 0.12;
      }
      // Integrate actual travel, as the visible gait does. Turning in place,
      // watching, listening and a locked attack must not invent extra footsteps.
      const creatureSpeed = Number.isFinite(enemySpeed) ? clamp(enemySpeed, 0, 3.5) : 0;
      const creatureMoving = ['stalk', 'hunt', 'investigate', 'search'].includes(enemyMode) && creatureSpeed > 0.08;
      if (creatureMoving) this._monsterStride += creatureSpeed * elapsed;
      if (creatureMoving && this._monsterStride >= this._monsterStepLength) {
        this._monsterStride -= this._monsterStepLength;
        this._monsterSide *= -1;
        // Searching places each foot carefully. The slow stalk alternates a
        // short step and a dragging long one; a chase closes that irregular gap.
        this._monsterStepLength = enemyMode === 'search' ? 1.06 : enemyMode === 'hunt' ? 0.96 : this._monsterSide > 0 ? 0.88 : 1.08;
        const quiet = enemyMode === 'search' ? 0.68 : enemyMode === 'hunt' ? 0.85 : 1;
        const spatial = audioSpatial(this._listener, this._monster, { occluded: this._occluded });
        const level = .079 * quiet;
        const pan = this._monsterSide * .13;
        if (presence > 0) {
          this._noise({ duration: enemyMode === 'hunt' ? 0.16 : enemyMode === 'search' ? 0.2 : 0.27,
            gain: level, frequency: enemyMode === 'search' ? 320 : 390,
            endFrequency: 180, type: 'lowpass', pan, spatial });
          this._tone({ frequency: 77, endFrequency: 42, duration: 0.15,
            gain: level * 0.5, pan, spatial });
          if (presence > 0.5 && enemyMode === 'stalk' && this._monsterSide < 0) {
            this._noise({ duration: 0.32, gain: level * 0.3, frequency: 1040,
              endFrequency: 480, type: 'bandpass', delay: 0.1, pan: -pan, spatial });
            this._tone({ frequency: 1840, endFrequency: 760, duration: .37,
              gain: .006, type: 'triangle', warble: 21, delay: .12, spatial });
          }
        }
      }
      // Dry inhalation, interrupted throat pulses, then a short falling resonance.
      // Long gaps between phrases leave the physical footsteps readable.
      if (presence > .08 && enemyMode !== 'dormant' && t >= this._nextCreatureBreath) {
        this._nextCreatureBreath = t + (enemyMode === 'hunt' ? 2.9 : 5.1) + Math.random() * 2;
        this._creatureBreath(audioSpatial(this._listener, this._monster, { occluded: this._occluded }), enemyMode === 'hunt');
      }
      if (presence > 0.08 && enemyMode !== 'dormant' && t >= this._nextSong) {
        this._nextSong = t + 11 + Math.random() * 8;
        const spatial = audioSpatial(this._listener, this._monster, { occluded: this._occluded, range: 38 });
        this._tone({ frequency: 186, endFrequency: 119, duration: 1.8, gain: .021, warble: 11, cutoff: 1300, spatial });
        this._tone({ frequency: 372, endFrequency: 301, duration: 1.13, gain: .008, delay: .57, warble: 17, spatial });
        this._noise({ duration: 1.47, gain: .014, frequency: 790, endFrequency: 410, type: 'bandpass', delay: .19, spatial });
      } else if (presence <= 0.08) {
        this._nextSong = Math.max(this._nextSong, t + 2.8);
        this._nextCreatureBreath = Math.max(this._nextCreatureBreath, t + 1.2);
      }
      if (inside && !dialogue && d < .5 && t >= this._nextTimber) {
        this._nextTimber = t + 14 + Math.random() * 12;
        const pan = Math.random() < .5 ? -.55 : .55;
        this._tone({ frequency: 115, endFrequency: 67, duration: .52, gain: .013, type: 'triangle', warble: 8, pan, cutoff: 740 });
        this._noise({ duration: .32, gain: .016, frequency: 510, endFrequency: 190, delay: .15, pan });
      }
      if (energy < 0.36 && (moving || hunted) && t >= this._nextBreath) {
        this._nextBreath = t + 1.55 - (running ? 0.25 : 0) + Math.random() * 0.2;
        this.cue('breath');
      } else if (energy >= 0.36) {
        this._nextBreath = t + 0.4;
      }
    } catch { /* A missed sound is preferable to a failed game frame. */ }
  }

  _footstep(surface, running, side) {
    const pan = side * .12, level = running ? .085 : .058;
    if (surface === 'wood' || surface === 'stairs') {
      this._noise({ duration: .07, gain: level * .75, frequency: 430, endFrequency: 150, pan });
      this._tone({ frequency: surface === 'stairs' ? 109 : 88, endFrequency: 47, duration: .13, gain: level * .47, pan });
      if (surface === 'stairs' || side < 0) this._tone({ frequency: 178 + side * 13, endFrequency: 111,
        duration: surface === 'stairs' ? .30 : .16, gain: level * .16, type: 'triangle', warble: 9, delay: .035, cutoff: 670, pan });
    } else if (surface === 'gravel') {
      this._noise({ duration: .14, gain: level, frequency: 1800, endFrequency: 620, type: 'bandpass', pan });
      this._noise({ duration: .045, gain: level * .52, frequency: 3200, type: 'highpass', delay: .04, pan });
      this._tone({ frequency: 72, endFrequency: 44, duration: .08, gain: level * .23, pan });
    } else {
      this._noise({ duration: .22, gain: level * .84, frequency: 2600, endFrequency: 520, type: 'bandpass', pan });
      this._noise({ duration: .06, gain: level * .58, frequency: 3700, endFrequency: 1300, type: 'highpass', delay: .035, pan });
      this._tone({ frequency: 65, endFrequency: 38, duration: .105, gain: level * .26, pan });
    }
  }

  _creatureBreath(spatial, hunting = false) {
    this._noise({ duration: .52, gain: hunting ? .053 : .035, frequency: 1350, endFrequency: 530, type: 'bandpass', spatial });
    for (let i = 0; i < 3; i++) {
      this._tone({ frequency: 94 - i * 7, endFrequency: 57, duration: .16 + i * .035,
        gain: .016 - i * .002, type: 'sawtooth', delay: .35 + i * .17, cutoff: 680, warble: 8, spatial });
    }
    this._noise({ duration: .73, gain: .029, frequency: 470, endFrequency: 180, type: 'bandpass', delay: .56, spatial });
  }

  cue(name, position) {
    if (!this._ready || !this.context || this.context.state !== 'running'
        || this.muted || this._hidden() || this.volume === 0) return;
    try {
      const now = this.context.currentTime;
      if (now < (this._cooldowns.get(name) || 0)) return;
      const cooldowns = { phone: 2.6, whisper: 1.8, radio: 0.65, tape: 1.3,
        knock: 1.7, bell: 1.8, windup: 0.5, attack: 0.55, hit: 0.45,
        stun: 1.2, hunt: 3, gate: 2, engine: 3, breath: 0.9,
        bellNeeded: 1.8, shutterOpen: .75, shutterClose: .75, radioTune: .08, radioLock: .6,
        objective:1.5,found:8,keyPickup:.6,bottlePickup:.6,crankPickup:.6 };
      this._cooldowns.set(name, now + (cooldowns[name] || 0.12));
      const creatureCue = ['windup', 'attack', 'stun', 'whisper'].includes(name);
      const source = position || (creatureCue ? this._monster : name === 'bell' || name === 'bellNeeded' ? { x: -12.7, z: -6, level: 0 } : null);
      this._cueSpatial = source ? audioSpatial(this._listener, source,
        { occluded: creatureCue && this._occluded, range: name === 'bell' || name === 'bellNeeded' ? 80 : 34 }) : null;
      switch (name) {
        case 'objective':
          this._noise({duration:.045,gain:.018,frequency:1400,type:'bandpass'});
          this._tone({frequency:620,endFrequency:740,duration:.12,gain:.01,delay:.06});
          break;
        case 'found':
          // One gentle camera-focus click per objective; never a repeating radar.
          this._tone({frequency:880,duration:.055,gain:.008});
          this._tone({frequency:1174,duration:.06,gain:.006,delay:.08});
          break;
        case 'keyPickup':
          [0,.045,.11].forEach((delay,i)=>this._tone({frequency:[1720,2360,1940][i],endFrequency:1100,duration:.12,gain:.018,delay}));
          this._noise({duration:.12,gain:.026,frequency:2400,type:'highpass'});
          break;
        case 'bottlePickup':
          [0,.14].forEach(delay=>{this._tone({frequency:285,endFrequency:140,duration:.16,gain:.025,delay});this._noise({duration:.12,gain:.025,frequency:620,endFrequency:280,delay});});
          break;
        case 'crankPickup':
          this._tone({frequency:390,endFrequency:140,duration:.32,gain:.026,type:'triangle'});
          this._noise({duration:.17,gain:.031,frequency:1250,endFrequency:450,type:'bandpass',delay:.02});
          break;
        case 'interact':
          this._noise({ duration: 0.075, gain: 0.055, frequency: 650 });
          break;
        case 'collect':
          this._noise({ duration: .12, gain: .045, frequency: 1600, endFrequency: 670, type: 'bandpass' });
          this._tone({ frequency: 710, endFrequency: 540, duration: .065, gain: .012, delay: .08 });
          break;
        case 'page':
          this._noise({ duration: 0.23, gain: 0.055, frequency: 1700, type: 'bandpass' });
          break;
        case 'phone': {
          // A small, memorable feature-phone ring; no abrupt full-volume alarm.
          const notes = [987.77, 1318.51, 1174.66, 783.99];
          for (let repeat = 0; repeat < 2; repeat++) {
            notes.forEach((frequency, i) => this._tone({ frequency, type: 'triangle',
              duration: 0.16, gain: 0.049, delay: repeat * 1.02 + i * 0.18, pan: 0.13 }));
          }
          break;
        }
        case 'repel':
          this._noise({ duration: 0.85, gain: 0.1, frequency: 1100, endFrequency: 190, type: 'bandpass' });
          this._tone({ frequency: 138, endFrequency: 47, duration: 0.65, gain: 0.04 });
          break;
        case 'ending':
          [220, 329.63, 493.88].forEach((frequency, i) => this._tone({ frequency,
            duration: 1.1, gain: 0.024, delay: i * 0.24 }));
          this._smooth(this._uneaseA.gain, 0, 0.3);
          this._smooth(this._uneaseB.gain, 0, 0.3);
          break;
        case 'fail':
          this._noise({ duration: 1.1, gain: 0.08, frequency: 270 });
          this._tone({ frequency: 62, endFrequency: 32, duration: 0.85, gain: 0.037 });
          this._smooth(this._uneaseA.gain, 0, 0.3);
          this._smooth(this._uneaseB.gain, 0, 0.3);
          break;
        case 'flashlight':
          this._noise({ duration: 0.035, gain: 0.05, frequency: 1700, type: 'highpass' });
          this._tone({ frequency: 240, endFrequency: 130, duration: 0.045, gain: 0.018 });
          break;
        case 'whisper':
          // Filtered air only: no generated words or speech synthesis.
          this._noise({ duration: 0.85, gain: 0.065, frequency: 920,
            endFrequency: 390, type: 'bandpass', pan: -0.45 });
          break;
        case 'radio':
          this._noise({ duration: 0.045, gain: 0.045, frequency: 2100, type: 'highpass' });
          this._noise({ duration: 0.38, gain: 0.041, frequency: 1200,
            endFrequency: 840, type: 'bandpass', delay: 0.04 });
          this._tone({ frequency: 1780, endFrequency: 1710, duration: 0.12,
            gain: 0.009, delay: 0.09 });
          this._noise({ duration: 0.035, gain: 0.036, frequency: 1900,
            type: 'highpass', delay: 0.43 });
          break;
        case 'tape':
          this._noise({ duration: 1.12, gain: 0.037, frequency: 1640,
            endFrequency: 480, type: 'bandpass' });
          this._tone({ frequency: 290, endFrequency: 93, duration: 0.68,
            gain: 0.021, type: 'triangle', warble: 8 });
          [0.19, 0.35, 0.63].forEach((delay, i) => this._noise({
            duration: 0.045, gain: 0.028 - i * 0.004, frequency: 1200,
            type: 'highpass', delay }));
          break;
        case 'knock':
          [0, 0.37, 0.98].forEach((delay, i) => {
            const pan = [-0.38, -0.31, -0.4][i];
            this._tone({ frequency: 146 - i * 7, endFrequency: 62,
              duration: 0.14, gain: i === 2 ? 0.051 : 0.044, delay, pan });
            this._noise({ duration: 0.07, gain: 0.035, frequency: 620,
              endFrequency: 270, delay, pan });
            this._tone({ frequency: 116, endFrequency: 71, duration: 0.19,
              gain: 0.012, delay: delay + 0.11, pan: 0.25 });
          });
          break;
        case 'bellNeeded':
        case 'bell':
          [1637, 2249, 3541].forEach((frequency, i) => this._tone({ frequency,
            duration: 1.55 - i * 0.23, gain: [0.023, 0.009, 0.005][i],
            delay: i * 0.009 }));
          this._noise({ duration: 0.035, gain: 0.016, frequency: 1900,
            type: 'bandpass' });
          break;
        case 'radioTune':
          this._noise({ duration: .045, gain: .025, frequency: 2700, endFrequency: 1400, type: 'bandpass' });
          break;
        case 'radioLock':
          this._noise({ duration: .07, gain: .038, frequency: 980, endFrequency: 350, type: 'bandpass' });
          this._tone({ frequency: 740, endFrequency: 520, duration: .1, gain: .009, delay: .04 });
          break;
        case 'shutterOpen':
        case 'shutterClose': {
          const closing = name === 'shutterClose';
          this._noise({ duration: .64, gain: .067, frequency: closing ? 1280 : 680, endFrequency: closing ? 330 : 1650, type: 'bandpass' });
          this._tone({ frequency: closing ? 196 : 107, endFrequency: closing ? 68 : 174, duration: .62, gain: .025, type: 'triangle', warble: 11, cutoff: 1900 });
          [0, .17, .31, .46].forEach((delay, i) => this._tone({ frequency: 620 + i * 97, endFrequency: 240, duration: .08, gain: .012, delay, type: 'triangle' }));
          this._noise({ duration: .075, gain: .069, frequency: 310, delay: .64 });
          break;
        }
        case 'windup':
          this._noise({ duration: .38, gain: .053, frequency: 330, endFrequency: 1060, type: 'bandpass' });
          this._tone({ frequency: 204, endFrequency: 337, duration: 0.56,
            gain: 0.025, type: 'triangle', warble: 18, pan: -0.22 });
          this._tone({ frequency: 791, endFrequency: 614, duration: 0.43,
            gain: 0.008, delay: 0.08, pan: 0.11 });
          this._noise({ duration: 0.45, gain: 0.029, frequency: 1720,
            endFrequency: 420, type: 'bandpass', pan: -0.2 });
          break;
        case 'attack':
          this._noise({ duration: 0.43, gain: 0.094, frequency: 380,
            endFrequency: 2400, type: 'bandpass', pan: -0.3 });
          this._noise({ duration: 0.14, gain: 0.057, frequency: 1950,
            endFrequency: 680, type: 'highpass', delay: 0.16, pan: 0.28 });
          this._tone({ frequency: 544, endFrequency: 174, duration: 0.49,
            gain: 0.023, type: 'triangle', delay: 0.12, pan: 0.14 });
          break;
        case 'hit':
          this._tone({ frequency: 76, endFrequency: 31, duration: 0.31, gain: 0.067 });
          this._noise({ duration: 0.24, gain: 0.071, frequency: 230,
            endFrequency: 110, type: 'lowpass' });
          this._noise({ duration: 0.055, gain: 0.038, frequency: 1100,
            type: 'bandpass', delay: 0.015 });
          break;
        case 'stun':
          this._noise({ duration: 0.96, gain: 0.07, frequency: 2400,
            endFrequency: 420, type: 'bandpass', pan: 0.18 });
          this._tone({ frequency: 184, endFrequency: 79, duration: 0.82,
            gain: 0.024, warble: 15, pan: 0.16 });
          [0.38, 0.83].forEach((delay, i) => this._noise({ duration: 0.23,
            gain: 0.035 - i * 0.01, frequency: 420, endFrequency: 190,
            delay, pan: i ? -0.18 : 0.24 }));
          break;
        case 'hunt':
          this._huntDuckedUntil = now + 2.1;
          this._smooth(this._windGain.gain, 0.005, 0.09);
          this._smooth(this._airGain.gain, 0.002, 0.09);
          this._smooth(this._uneaseA.gain, 0, 0.09);
          this._smooth(this._uneaseB.gain, 0, 0.09);
          this._tone({ frequency: 47, endFrequency: 28, duration: 1.2, gain: 0.051 });
          this._tone({ frequency: 42, endFrequency: 26, duration: 1,
            gain: 0.032, delay: 0.58 });
          this._noise({ duration: 1.3, gain: 0.025, frequency: 290,
            endFrequency: 80, type: 'lowpass' });
          break;
        case 'gate':
          this._noise({ duration: 1.5, gain: 0.065, frequency: 670,
            endFrequency: 220, type: 'bandpass' });
          this._tone({ frequency: 102, endFrequency: 57, duration: 1.65,
            gain: 0.029, type: 'triangle', warble: 6 });
          for (let i = 0; i < 6; i++) {
            this._tone({ frequency: 720 + i * 83, endFrequency: 350 + i * 23,
              duration: 0.17, gain: 0.019, type: 'triangle', delay: i * 0.17,
              pan: i % 2 ? 0.12 : -0.12 });
          }
          break;
        case 'engine':
          // Starter pulses, then a low rising engine; about 2.6 seconds total.
          for (let i = 0; i < 6; i++) {
            this._tone({ frequency: 72 + i * 5, endFrequency: 42 + i * 4,
              duration: 0.115, gain: 0.033, type: 'triangle', delay: i * 0.11 });
          }
          this._noise({ duration: 2.5, gain: 0.046, frequency: 170,
            endFrequency: 370, type: 'lowpass', delay: 0.12 });
          this._tone({ frequency: 32, endFrequency: 61, duration: 2.25,
            gain: 0.028, type: 'sawtooth', delay: 0.34, cutoff: 310, warble: 3 });
          break;
        case 'breath':
          this._noise({ duration: 0.25, gain: 0.044, frequency: 430,
            endFrequency: 1060, type: 'bandpass', pan: -0.06 });
          this._noise({ duration: 0.56, gain: 0.052, frequency: 720,
            endFrequency: 290, type: 'bandpass', delay: 0.28, pan: 0.04 });
          break;
        default:
          break;
      }
    } catch { /* An unavailable cue must not interrupt interaction. */ }
    finally { this._cueSpatial = null; }
  }

  _tone({ frequency, endFrequency = frequency, duration = 0.1, gain = 0.03,
    type = 'sine', delay = 0, pan = 0, warble = 0, cutoff = 0, spatial = this._cueSpatial }) {
    if (this._voices.size >= 28) return;
    const source = this.context.createOscillator();
    source.type = type;
    const start = this.context.currentTime + delay;
    if (warble && source.frequency.setValueCurveAtTime) {
      const curve = new Float32Array(40);
      for (let i = 0; i < curve.length; i++) {
        const u = i / (curve.length - 1);
        const base = frequency * Math.pow(Math.max(20, endFrequency) / frequency, u);
        curve[i] = Math.max(20, base + Math.sin(u * 31.7) * warble + Math.sin(u * 12.3) * warble * 0.35);
      }
      source.frequency.setValueCurveAtTime(curve, start, duration);
    } else {
      source.frequency.setValueAtTime(frequency, start);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    const filters = [];
    if (cutoff) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.45;
      filters.push(filter);
    }
    this._voice(source, filters, start, duration, gain, pan, undefined, spatial);
  }

  _noise({ duration = 0.1, gain = 0.03, frequency = 700,
    endFrequency = frequency, type = 'lowpass', delay = 0, pan = 0, spatial = this._cueSpatial }) {
    if (this._voices.size >= 28) return;
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? 0.65 : 0.4;
    const start = ctx.currentTime + delay;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), start + duration);
    this._voice(source, [filter], start, duration, gain, pan, Math.random() * Math.max(0, 2.9 - duration), spatial);
  }

  _voice(source, filters, start, duration, level, pan, offset, spatial = null) {
    const ctx = this.context;
    if (spatial) {
      level *= spatial.gain;
      pan = clamp(spatial.pan + pan * .12, -.92, .92);
      const wallFilter = ctx.createBiquadFilter(); wallFilter.type = 'lowpass'; wallFilter.frequency.value = spatial.cutoff; wallFilter.Q.value = .45;
      filters.push(wallFilter);
    }
    const envelope = ctx.createGain();
    const attack = Math.min(0.025, duration * 0.16);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(clamp(level, 0, 0.12), start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    envelope.gain.setValueAtTime(0, start + duration + 0.005);
    const chain = [source, ...filters, envelope];
    if (ctx.createStereoPanner && pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -0.92, 0.92);
      chain.push(panner);
    }
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    chain[chain.length - 1].connect(this._effects);
    const voice = { source, chain };
    this._voices.add(voice);
    source.onended = () => {
      chain.forEach(node => { try { node.disconnect(); } catch {} });
      this._voices.delete(voice);
    };
    if (offset !== undefined) source.start(start, offset);
    else source.start(start);
    source.stop(start + duration + 0.025);
  }

  dispose() {
    this.stopGuideVoice();
    this._disposed = true;
    this._ready = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
    for (const voice of this._voices) {
      try { voice.source.stop(); } catch {}
      voice.chain.forEach(node => { try { node.disconnect(); } catch {} });
    }
    this._voices.clear();
    this._continuous.forEach(node => {
      try { if (node.stop) node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    });
    this._continuous = [];
    if (this.context) {
      try { this.context.close().catch(() => {}); } catch {}
    }
    this.context = null;
  }
}

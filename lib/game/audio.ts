import { CARNAGE_SOUNDS } from './escalation';
import type { GameEvent, GameState } from './simulation';
import { worldById } from './content';
export class HorseAudio {
  context: AudioContext | null = null;
  music = true;
  effects = true;
  private master: GainNode | null = null;
  private output: GainNode | null = null;
  private trackGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectGain: GainNode | null = null;
  private recording: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private source: AudioBufferSourceNode | null = null;
  private musicId = '';
  private musicRequest = 0;
  private voices = new Set<AudioBufferSourceNode>();
  private hoof = 0;
  private disposed = false;
  private played = new Set<string>();
  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.8;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -8;
        compressor.knee.value = 5;
        compressor.ratio.value = 20;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        const limiter = this.context.createWaveShaper();
        const curve = new Float32Array(4096);
        for (let i = 0; i < curve.length; i++)
          curve[i] = 0.87 * Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.2);
        limiter.curve = curve;
        limiter.oversample = '2x';
        this.output = this.context.createGain();
        this.master.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(this.output);
        this.output.connect(this.context.destination);
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = 0.28;
        this.musicGain.connect(this.master);
        this.effectGain = this.context.createGain();
        this.effectGain.connect(this.master);
        for (const id of [
          ...CARNAGE_SOUNDS,
          'gallop',
          'flip',
          'ring',
          'ui-click',
          'honk',
          'warning',
          'rebound',
          'explosion',
          'woodbreak',
          'metalcrash',
          'glassbreak',
          'teethchomp',
          'baler',
          'piano',
          'stamp',
          'ghost',
          'ufo',
          'splat',
          'water',
          'sheep',
          'goose',
          'crowd',
          'laugh',
          'eject',
          'blackhole',
          'equip',
          'upgrade',
          'insurance',
          'win',
          'lose',
          'fanfare',
          'wind',
          'boing',
          'flap',
          'kick',
          'squish',
          'coin',
          'jump',
          'boneclatter',
        ])
          void this.load(id);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      /* Silent play remains available. */
    }
  }
  private load(id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id)!);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const request = fetch(`/audio/${id}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error('Audio unavailable');
        return r.arrayBuffer();
      })
      .then((b) => this.context!.decodeAudioData(b))
      .then((b) => {
        this.buffers.set(id, b);
        return b;
      })
      .catch(() => null);
    this.loading.set(id, request);
    return request;
  }
  private sample(id: string, volume = 1, rate = 1) {
    const c = this.context;
    if (!c || c.state !== 'running' || !this.effects || this.disposed) return;
    const b = this.buffers.get(id);
    if (!b) {
      void this.load(id);
      this.note(150, 0.06, 0.035);
      return;
    }
    if (this.voices.size >= 10) return;
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = b;
    source.playbackRate.value = rate;
    gain.gain.value = volume * 0.65;
    source.connect(gain);
    gain.connect(this.effectGain!);
    this.voices.add(source);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
  }
  note(freq: number, duration: number, volume = 0.06) {
    const c = this.context;
    if (!c || c.state !== 'running' || !this.effects) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(this.effectGain!);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  event(e: GameEvent) {
    if (e.id) {
      if (this.played.has(e.id)) return;
      this.played.add(e.id);
      if (this.played.size > 500)
        this.played.delete(this.played.values().next().value!);
    }
    const names: Record<string, string> = {
      tap: 'gallop',
      bounce: 'boing',
      land: 'squish',
      crunch: 'boneclatter',
      record: 'win',
      count: 'ui-click',
    };
    const sound = e.sound ?? names[e.kind] ?? e.kind;
    if (e.propulsion) {
      // The bundled comic squish becomes a low raspberry on the same flap beat.
      this.sample('squish', 0.85, e.propulsion.power > 1 ? 0.58 : 0.76);
      this.sample('flap', 0.35);
    } else {
      this.sample(
        sound,
        e.kind === 'tap' ? 0.22 : e.value && e.value < 1 ? e.value : 1,
      );
    }
    if (this.musicGain && ['crunch', 'land'].includes(e.kind)) {
      const c = this.context!;
      this.musicGain.gain.cancelScheduledValues(c.currentTime);
      this.musicGain.gain.setTargetAtTime(0.08, c.currentTime, 0.02);
      this.musicGain.gain.setTargetAtTime(
        this.music ? 0.28 : 0,
        c.currentTime + 0.4,
        0.2,
      );
    }
  }
  private async changeMusic(id: string) {
    if (id === this.musicId) return;
    this.musicId = id;
    const request = ++this.musicRequest;
    const buffer = await this.load(id);
    if (
      !buffer ||
      request !== this.musicRequest ||
      this.disposed ||
      !this.context
    )
      return;
    const c = this.context,
      old = this.source,
      oldGain = this.trackGain;
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.musicGain!);
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
    source.start();
    this.source = source;
    this.trackGain = gain;
    if (old) {
      oldGain?.gain.cancelScheduledValues(c.currentTime);
      oldGain?.gain.setValueAtTime(oldGain.gain.value, c.currentTime);
      oldGain?.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
      try {
        old.stop(c.currentTime + 0.65);
      } catch {}
    }
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }
  tick(s: GameState) {
    const c = this.context;
    if (!c || c.state !== 'running' || s.paused) return;
    this.effectGain!.gain.value = this.effects ? 1 : 0;
    if (!this.music) this.musicGain!.gain.value = 0;
    else if (this.musicGain!.gain.value === 0)
      this.musicGain!.gain.value = 0.28;
    const id =
      s.phase === 'title'
        ? 'main'
        : s.boss
          ? `boss-act${worldById(s.world).act + 1}`
          : s.world;
    void this.changeMusic(id);
    if (this.effects && s.phase === 'runup' && c.currentTime > this.hoof) {
      this.hoof = c.currentTime + 34 / s.speed;
      this.sample('gallop', 0.16, 1 + s.speed / 800);
    }
  }
  async prepare(events: GameEvent[], s: GameState) {
    await Promise.all(
      [
        'main',
        ...(events.some((e) => e.propulsion) ? ['squish'] : []),
        s.world,
        s.boss ? `boss-act${worldById(s.world).act + 1}` : s.world,
        ...events.map(
          (e) =>
            e.sound ??
            (
              {
                bounce: 'boing',
                land: 'squish',
                crunch: 'boneclatter',
                record: 'win',
                count: 'ui-click',
                tap: 'gallop',
              } as Record<string, string>
            )[e.kind] ??
            e.kind,
        ),
      ].map((id) => this.load(id)),
    );
  }
  recordingStream() {
    if (!this.context || !this.output) return null;
    this.recording ??= this.context.createMediaStreamDestination();
    this.output.connect(this.recording);
    return this.recording.stream;
  }
  reset() {
    this.played.clear();
  }
  pause() {
    void this.context?.suspend().catch(() => {});
  }
  dispose() {
    this.disposed = true;
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {}
    }
    try {
      this.source?.stop();
    } catch {}
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}

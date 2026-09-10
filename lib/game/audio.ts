import {
  eventAudio,
  levelAudio,
  MUSIC_AUDIO,
  soundPriority,
  type AudioId,
} from './catalogue/audio-assets';
import type { GameEvent, GameState } from './simulation';
import { worldById, type WorldId } from './content';

/** A playing effect voice and the priority that decides what it may evict. */
type Voice = { priority: number; gain: GainNode };

/**
 * The quietest voice in `voices` ranked below `floor`, or undefined when every
 * voice already outranks it. Callers use this to decide whether a new sound is
 * worth stealing a slot from one that is still playing.
 */
function lowestVoice(
  voices: Map<AudioBufferSourceNode, Voice>,
  floor: number,
): AudioBufferSourceNode | undefined {
  let victim: AudioBufferSourceNode | undefined,
    lowest = floor;
  for (const [voice, meta] of voices) {
    if (meta.priority < lowest) {
      victim = voice;
      lowest = meta.priority;
    }
  }
  return victim;
}

/** Playback gain for one bundled event sound, on the 0-1 effect scale. */
function eventVolume(e: GameEvent): number {
  if (e.kind === 'tap') return 0.22;
  return e.value && e.value < 1 ? e.value : 1;
}

/**
 * Dips the music bed for an impact and lets it climb back over the following
 * half second. Scheduled on the ducking node alone so the player's music mute
 * is never overwritten, and any earlier ramp is cancelled first.
 */
function duckMusic(duck: GainNode, c: AudioContext) {
  duck.gain.cancelScheduledValues(c.currentTime);
  duck.gain.setTargetAtTime(0.08 / 0.28, c.currentTime, 0.02);
  duck.gain.setTargetAtTime(1, c.currentTime + 0.4, 0.2);
}

/**
 * The game's whole audio stage: one lazily created AudioContext behind a
 * compressor and limiter, a music bus that can be ducked independently of the
 * player's mute, an effect bus capped at ten concurrent voices, and a cache of
 * decoded buffers. Every method is safe to call before `unlock` has run or
 * after `dispose`; playback is simply skipped rather than throwing.
 */
export class HorseAudio {
  context: AudioContext | null = null;
  private musicEnabled = true;
  private effectsEnabled = true;
  private master: GainNode | null = null;
  private output: GainNode | null = null;
  private trackGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private effectGain: GainNode | null = null;
  private recording: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private source: AudioBufferSourceNode | null = null;
  private musicId = '';
  private musicRequest = 0;
  private voices = new Map<
    AudioBufferSourceNode,
    { priority: number; gain: GainNode }
  >();
  private hoof = 0;
  private disposed = false;
  private played = new Set<string>();
  private requests = new Set<AbortController>();
  get music() {
    return this.musicEnabled;
  }
  set music(enabled: boolean) {
    this.musicEnabled = enabled;
    if (this.musicGain) this.musicGain.gain.value = enabled ? 0.28 : 0;
  }
  get effects() {
    return this.effectsEnabled;
  }
  set effects(enabled: boolean) {
    this.effectsEnabled = enabled;
    if (this.effectGain) this.effectGain.gain.value = enabled ? 1 : 0;
  }
  async unlock() {
    if (this.disposed) return;
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
        this.musicGain.gain.value = this.music ? 0.28 : 0;
        // Impact automation belongs to a separate envelope. It must never
        // overwrite the user's mute gate, even between animation frames.
        this.duckGain = this.context.createGain();
        this.musicGain.connect(this.duckGain);
        this.duckGain.connect(this.master);
        this.effectGain = this.context.createGain();
        this.effectGain.gain.value = this.effects ? 1 : 0;
        this.effectGain.connect(this.master);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      /* Silent play remains available. */
    }
  }
  private load(id: AudioId): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id)!);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const context = this.context;
    if (!context || this.disposed) return Promise.resolve(null);
    const abort = new AbortController();
    this.requests.add(abort);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      abort.signal.addEventListener(
        'abort',
        () => reject(new Error('Audio preparation interrupted')),
        { once: true },
      );
      timeout = setTimeout(() => abort.abort(), 20000);
    });
    const decoded = fetch(`/audio/${id}.mp3`, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Audio unavailable');
        return r.arrayBuffer();
      })
      .then((b) => context.decodeAudioData(b));
    // AbortController alone cannot settle a stalled native audio decoder.
    const request = Promise.race([decoded, cancelled])
      .then((b) => {
        if (this.disposed || abort.signal.aborted) return null;
        this.buffers.set(id, b);
        return b;
      })
      .catch(() => null)
      .finally(() => {
        clearTimeout(timeout);
        this.requests.delete(abort);
        this.loading.delete(id);
      });
    this.loading.set(id, request);
    return request;
  }
  private sample(id: AudioId, volume = 1, rate = 1) {
    const c = this.context;
    if (!c || c.state !== 'running' || !this.effects || this.disposed) return;
    const b = this.buffers.get(id);
    if (!b) {
      void this.load(id);
      this.note(150, 0.06, 0.035);
      return;
    }
    const priority = soundPriority(id);
    if (this.voices.size >= 10) {
      const victim = lowestVoice(this.voices, priority);
      if (!victim) return;
      victim.stop();
      victim.disconnect();
      this.voices.get(victim)!.gain.disconnect();
      this.voices.delete(victim);
    }
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = b;
    source.playbackRate.value = rate;
    gain.gain.value = volume * 0.65;
    source.connect(gain);
    gain.connect(this.effectGain!);
    this.voices.set(source, { priority, gain });
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
  /**
   * Records that an identified event has been heard, returning false when it
   * already had been. The memory is bounded at 500 ids, oldest discarded first.
   */
  private claimEvent(id: string) {
    if (this.played.has(id)) return false;
    this.played.add(id);
    if (this.played.size > 500)
      this.played.delete(this.played.values().next().value!);
    return true;
  }
  /** Plays whatever sounds the event carries, at its own mix level. */
  private eventSounds(e: GameEvent) {
    if (e.propulsion) {
      // The bundled comic squish becomes a low raspberry on the same flap beat.
      this.sample('squish', 0.85, e.propulsion.power > 1 ? 0.58 : 0.76);
      this.sample('flap', 0.35);
      return;
    }
    for (const sound of eventAudio(e)) this.sample(sound, eventVolume(e));
  }
  event(e: GameEvent) {
    if (e.id && !this.claimEvent(e.id)) return;
    this.eventSounds(e);
    const duck = this.duckGain;
    if (duck && ['crunch', 'land'].includes(e.kind))
      duckMusic(duck, this.context!);
  }
  private async changeMusic(id: AudioId) {
    if (id === this.musicId) return;
    this.musicId = id;
    const request = ++this.musicRequest;
    const buffer = await this.load(id);
    if (request !== this.musicRequest || this.disposed || !this.context) return;
    if (!buffer) {
      this.musicId = '';
      return;
    }
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
    const id: AudioId =
      s.phase === 'title'
        ? 'main'
        : s.boss
          ? (`boss-act${worldById(s.world).act + 1}` as AudioId)
          : s.world;
    void this.changeMusic(id);
    if (this.effects && s.phase === 'runup' && c.currentTime > this.hoof) {
      this.hoof = c.currentTime + 34 / s.speed;
      this.sample('gallop', 0.16, 1 + s.speed / 800);
    }
  }
  async prepare(events: GameEvent[], s: GameState) {
    const tracks = levelAudio(s.world, s.boss).filter((id) =>
      MUSIC_AUDIO.includes(id as (typeof MUSIC_AUDIO)[number]),
    );
    await this.preload([...tracks, ...events.flatMap(eventAudio)]);
  }
  async prepareLevel(
    world: WorldId,
    boss: boolean,
    progress: (value: number) => void = () => {},
  ) {
    const ids = levelAudio(world, boss);
    await this.preload(ids, progress);
    // Keep shared effects and this course's tracks; long decoded music buffers
    // do not accumulate over a nine-event tour. Playing sources own their buffer.
    for (const id of MUSIC_AUDIO)
      if (!ids.includes(id)) this.buffers.delete(id);
  }
  private async preload(
    ids: AudioId[],
    progress: (value: number) => void = () => {},
  ) {
    // AudioContext can be unavailable. A suspended context still decodes assets;
    // readiness must never wait for a second autoplay permission gesture.
    if (!this.context || this.disposed) {
      progress(1);
      return;
    }
    const queue = [...new Set(ids)];
    let next = 0,
      complete = 0;
    const missing: AudioId[] = [];
    await Promise.all(
      Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (next < queue.length && !this.disposed) {
          const id = queue[next++];
          if (!(await this.load(id))) missing.push(id);
          progress(++complete / queue.length);
        }
      }),
    );
    if (missing.length && !this.disposed)
      throw new Error(
        'Some sounds could not load. Check your connection and try again.',
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
    if (this.context && this.duckGain) {
      this.duckGain.gain.cancelScheduledValues(this.context.currentTime);
      this.duckGain.gain.value = 1;
    }
    for (const [voice, meta] of this.voices) {
      try {
        voice.stop();
      } catch {
        /* An already-ended voice is harmless. */
      }
      voice.disconnect();
      meta.gain.disconnect();
    }
    this.voices.clear();
    this.hoof = 0;
  }
  pause() {
    void this.context?.suspend().catch(() => {});
  }
  dispose() {
    this.disposed = true;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    this.buffers.clear();
    this.reset();
    try {
      this.source?.stop();
    } catch {}
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}

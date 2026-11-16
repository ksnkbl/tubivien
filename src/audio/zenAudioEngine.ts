import type { MusicState, MusicTrack } from '../shared/types.ts';

export function extractYouTubeVideoId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (params: { videoId: string }) => void;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          height?: string;
          width?: string;
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * Lightweight Web Audio synthesizer for default meditation music & temple ritual SFX,
 * paired with HTML5 <audio> streaming and YouTube IFrame Player API for Admin YouTube tracks.
 */
class ZenAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private chimeTimer: number | null = null;
  private audioEl: HTMLAudioElement | null = null;

  // Lazy YouTube player state
  private ytPlayer: YTPlayerInstance | null = null;
  private ytReady = false;
  private ytLoadingPromise: Promise<void> | null = null;
  private desiredYtVideoId: string | null = null;
  private loadedYtVideoId: string | null = null;
  private desiredYtPlaying = false;

  private volume = 0.55;
  private muted = false;
  private isBuiltinPlaying = false;
  private currentTrackId: string | null = null;
  private loadedAudioTrackId: string | null = null;
  private unlocked = false;
  private shouldLoopSingle = true;
  private onTrackEndedCb: (() => void) | null = null;
  private builtinAdvanceTimer: number | null = null;

  public setOnTrackEnded(cb: (() => void) | null) {
    this.onTrackEndedCb = cb;
  }

  private compressor: DynamicsCompressorNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.2;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.unlocked = true;
    return this.ctx;
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.loop = this.shouldLoopSingle;
      this.audioEl.preload = 'auto';
      this.audioEl.volume = this.muted ? 0 : this.volume;
      this.audioEl.onended = () => {
        if (!this.shouldLoopSingle) {
          this.onTrackEndedCb?.();
        }
      };
    }
    return this.audioEl;
  }

  private loadYouTubeApi(): Promise<void> {
    if (window.YT?.Player) return Promise.resolve();
    if (this.ytLoadingPromise) return this.ytLoadingPromise;

    this.ytLoadingPromise = new Promise((resolve) => {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });

    return this.ytLoadingPromise;
  }

  private async syncYouTubePlayback(videoId: string | null, shouldPlay: boolean) {
    this.desiredYtVideoId = videoId;
    this.desiredYtPlaying = shouldPlay;

    if (!videoId || !shouldPlay) {
      if (this.ytPlayer && this.ytReady) {
        try {
          this.ytPlayer.pauseVideo();
        } catch {
          // ignore
        }
      }
      return;
    }

    await this.loadYouTubeApi();
    if (this.desiredYtVideoId !== videoId || !this.desiredYtPlaying) return;

    if (!this.ytPlayer && window.YT?.Player) {
      let host = document.getElementById('yt-zen-audio-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'yt-zen-audio-host';
        host.style.position = 'fixed';
        host.style.left = '-9999px';
        host.style.top = '-9999px';
        host.style.width = '200px';
        host.style.height = '200px';
        host.style.opacity = '0.01';
        host.style.pointerEvents = 'none';
        document.body.appendChild(host);
      }
      const targetDiv = document.createElement('div');
      host.innerHTML = '';
      host.appendChild(targetDiv);

      this.loadedYtVideoId = videoId;
      this.ytPlayer = new window.YT.Player(targetDiv, {
        height: '200',
        width: '200',
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            this.ytReady = true;
            this.applyYouTubeVolume();
            if (this.desiredYtPlaying && this.desiredYtVideoId) {
              if (this.desiredYtVideoId !== this.loadedYtVideoId) {
                this.loadedYtVideoId = this.desiredYtVideoId;
                event.target.loadVideoById({ videoId: this.desiredYtVideoId });
              }
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event) => {
            // 0 === ENDED -> either loop single track or advance sequential playlist
            if (event.data === 0 && this.desiredYtPlaying) {
              if (this.shouldLoopSingle) {
                event.target.playVideo();
              } else {
                this.onTrackEndedCb?.();
              }
            }
          },
        },
      });
    } else if (this.ytPlayer && this.ytReady) {
      this.applyYouTubeVolume();
      if (this.loadedYtVideoId !== videoId) {
        this.loadedYtVideoId = videoId;
        this.ytPlayer.loadVideoById({ videoId });
        this.ytPlayer.playVideo();
      } else {
        this.ytPlayer.playVideo();
      }
    }
  }

  private applyYouTubeVolume() {
    if (!this.ytPlayer || !this.ytReady) return;
    try {
      if (this.muted) {
        this.ytPlayer.mute();
      } else {
        this.ytPlayer.unMute();
        this.ytPlayer.setVolume(Math.round(this.volume * 100));
      }
    } catch {
      // ignore
    }
  }

  public unlock() {
    this.ensureContext();
    if (this.audioEl && this.audioEl.paused && this.currentTrackId && !this.isBuiltinPlaying && !this.currentTrackId.startsWith('yt:')) {
      void this.audioEl.play().catch(() => {});
    }
    if (this.desiredYtVideoId && this.desiredYtPlaying) {
      void this.syncYouTubePlayback(this.desiredYtVideoId, true);
    }
  }

  public isAudioUnlocked(): boolean {
    return this.unlocked && (!this.ctx || this.ctx.state === 'running');
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    const effective = this.muted ? 0 : this.volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.05);
    }
    if (this.audioEl) {
      this.audioEl.volume = effective;
    }
    this.applyYouTubeVolume();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    this.setVolume(this.volume);
  }

  public getVolume(): number {
    return this.volume;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private startBuiltinZen() {
    if (this.isBuiltinPlaying) return;
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    this.isBuiltinPlaying = true;

    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.001, ctx.currentTime);
    droneGain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 2.2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    droneGain.connect(filter);
    filter.connect(this.masterGain);
    this.droneGain = droneGain;

    const freqs = [146.83, 220.0];
    this.droneOscs = freqs.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(droneGain);
      osc.start();
      return osc;
    });

    const scale = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25];
    let step = 0;

    const triggerNote = () => {
      if (!this.isBuiltinPlaying || !this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const noteFreq = scale[(step * 3 + Math.floor(Math.random() * 2)) % scale.length];
      step++;

      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, now);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(noteFreq * 2.0, now);

      const overtoneGain = this.ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.15, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.13, now + 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.0008, now + 3.6);

      osc.connect(noteGain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc.start(now);
      overtone.start(now);
      osc.stop(now + 3.8);
      overtone.stop(now + 3.8);

      const nextDelay = 2400 + Math.random() * 1900;
      this.chimeTimer = window.setTimeout(triggerNote, nextDelay);
    };

    this.chimeTimer = window.setTimeout(triggerNote, 450);
  }

  private clearBuiltinAdvanceTimer() {
    if (this.builtinAdvanceTimer !== null) {
      clearTimeout(this.builtinAdvanceTimer);
      this.builtinAdvanceTimer = null;
    }
  }

  private stopBuiltinZen() {
    this.isBuiltinPlaying = false;
    this.clearBuiltinAdvanceTimer();
    if (this.chimeTimer !== null) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    if (this.droneGain && this.ctx) {
      try {
        this.droneGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      } catch {
        // ignore
      }
    }
    const oscs = this.droneOscs;
    this.droneOscs = [];
    window.setTimeout(() => {
      oscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
    }, 350);
  }

  public syncMusicState(musicState: MusicState, tracks: MusicTrack[]) {
    const validIds = new Set(tracks.map((t) => t.id));
    const selectedPlaylist = (musicState.playlistTrackIds ?? []).filter((id) => validIds.has(id));
    const effectiveList =
      musicState.playMode === 'playlist'
        ? selectedPlaylist.length > 0
          ? selectedPlaylist
          : tracks.map((t) => t.id)
        : [musicState.activeTrackId];
    this.shouldLoopSingle = !(musicState.playMode === 'playlist' && effectiveList.length > 1);
    if (this.audioEl) {
      this.audioEl.loop = this.shouldLoopSingle;
    }

    const activeTrack = tracks.find((t) => t.id === musicState.activeTrackId) || tracks[0];
    if (!activeTrack) return;

    if (!musicState.isPlaying) {
      this.stopBuiltinZen();
      if (this.audioEl) this.audioEl.pause();
      const pausedYtId = extractYouTubeVideoId(activeTrack.audioUrl);
      void this.syncYouTubePlayback(pausedYtId, false);
      this.currentTrackId = pausedYtId ? `yt:${pausedYtId}` : activeTrack.id;
      return;
    }

    if (activeTrack.sourceType === 'builtin') {
      if (this.audioEl) this.audioEl.pause();
      void this.syncYouTubePlayback(null, false);
      this.currentTrackId = activeTrack.id;
      this.startBuiltinZen();
      this.clearBuiltinAdvanceTimer();
      if (!this.shouldLoopSingle) {
        this.builtinAdvanceTimer = window.setTimeout(() => {
          if (!this.shouldLoopSingle && this.isBuiltinPlaying) {
            this.onTrackEndedCb?.();
          }
        }, 90000);
      }
      return;
    }

    const ytId = extractYouTubeVideoId(activeTrack.audioUrl);
    if (ytId) {
      this.stopBuiltinZen();
      if (this.audioEl) this.audioEl.pause();
      this.currentTrackId = `yt:${ytId}`;
      void this.syncYouTubePlayback(ytId, true);
      return;
    }

    // Uploaded audio data-URL / file stream
    void this.syncYouTubePlayback(null, false);
    this.stopBuiltinZen();
    const audio = this.ensureAudioElement();
    audio.loop = this.shouldLoopSingle;
    const streamUrl = activeTrack.audioUrl || `/api/music/stream/${encodeURIComponent(activeTrack.id)}`;
    if (this.loadedAudioTrackId !== activeTrack.id) {
      this.loadedAudioTrackId = activeTrack.id;
      audio.src = streamUrl;
      audio.load();
      audio.currentTime = 0;
    }
    this.currentTrackId = activeTrack.id;
    audio.volume = this.muted ? 0 : this.volume;
    void audio.play().catch(() => {});
  }

  public stopAllMusic() {
    this.stopBuiltinZen();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    void this.syncYouTubePlayback(null, false);
    this.currentTrackId = null;
    this.loadedAudioTrackId = null;
    this.loadedYtVideoId = null;
  }

  // --- Temple Ritual Sound Effects ---
  public playBellSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Rich Đại Hồng Chung resonance with crisp mallet strike transient
    const partials = [
      { freq: 146.83, amp: 0.56, decay: 5.2 },
      { freq: 196.0, amp: 0.72, decay: 4.8 },
      { freq: 293.66, amp: 0.42, decay: 4.0 },
      { freq: 392.0, amp: 0.36, decay: 3.4 },
      { freq: 589.5, amp: 0.24, decay: 2.5 },
      { freq: 830.0, amp: 0.16, decay: 1.8 },
      { freq: 1176.0, amp: 0.09, decay: 1.1 },
    ];

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(p.amp, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + p.decay);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now);
      osc.stop(now + p.decay + 0.12);
    });
  }

  public playWoodfishSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Hollow wooden body resonance (clear, louder "cốc" percussion)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(660, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(340, now + 0.095);

    bodyGain.gain.setValueAtTime(0.001, now);
    bodyGain.gain.linearRampToValueAtTime(0.76, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.21);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.23);

    // Crisp harmonic wood knock overtone
    const knockOsc = ctx.createOscillator();
    const knockGain = ctx.createGain();
    knockOsc.type = 'sine';
    knockOsc.frequency.setValueAtTime(1180, now);
    knockOsc.frequency.exponentialRampToValueAtTime(760, now + 0.045);

    knockGain.gain.setValueAtTime(0.001, now);
    knockGain.gain.linearRampToValueAtTime(0.42, now + 0.004);
    knockGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);

    knockOsc.connect(knockGain);
    knockGain.connect(this.masterGain);
    knockOsc.start(now);
    knockOsc.stop(now + 0.11);
  }

  public playIncenseChime() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    [587.33, 880.0].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.12 + 1.4);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.5);
    });
  }

  public playSweepSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Two gentle bamboo broom brush strokes
    [0, 0.28].forEach((offset) => {
      const dur = 0.22;
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * dur), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = Math.sin((i / data.length) * Math.PI);
        data[i] = (Math.random() * 2 - 1) * env;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now + offset);
      filter.frequency.exponentialRampToValueAtTime(920, now + offset + dur);
      filter.Q.value = 1.4;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      src.start(now + offset);
    });
  }

  public playFishReleaseSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Gentle water splash plops + serene pentatonic shimmer
    [0, 0.18].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const baseFreq = idx === 0 ? 340 : 420;
      osc.frequency.setValueAtTime(baseFreq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.65, now + offset + 0.09);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.16, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + offset + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.24);
    });

    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(659.25, now + 0.12);
    chimeGain.gain.setValueAtTime(0.001, now + 0.12);
    chimeGain.gain.linearRampToValueAtTime(0.1, now + 0.14);
    chimeGain.gain.exponentialRampToValueAtTime(0.0005, now + 1.1);
    chime.connect(chimeGain);
    chimeGain.connect(this.masterGain);
    chime.start(now + 0.12);
    chime.stop(now + 1.15);
  }

  public playGardenWaterSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Gentle sparkling water droplets + soft major pentatonic bloom note
    [0, 0.14, 0.28].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const freqs = [523.25, 659.25, 783.99];
      osc.frequency.setValueAtTime(freqs[idx], now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.11, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0006, now + offset + 0.65);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.7);
    });
  }

  public playLanternSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    [440, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.001, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.1 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.1 + 1.5);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 1.6);
    });
  }

  public playKoiFeedSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    [0, 0.11, 0.23].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const startF = 480 + idx * 65;
      osc.frequency.setValueAtTime(startF, now + offset);
      osc.frequency.exponentialRampToValueAtTime(startF * 1.5, now + offset + 0.06);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + offset + 0.16);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    });
  }

  public playWishRibbonSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Gentle silk ribbon toss whoosh
    const dur = 0.22;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + dur);
    filter.Q.value = 1.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);

    // Clear wind-chime sparkle as ribbon catches the branch
    [659.25, 880, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.16 + idx * 0.09);
      gain.gain.setValueAtTime(0.001, now + 0.16 + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.18 + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.35 + idx * 0.09);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + 0.16 + idx * 0.09);
      osc.stop(now + 1.45 + idx * 0.09);
    });
  }

  public playBowChimeSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Warm brass khánh / singing bowl resonance for Lạy Phật
    [
      { freq: 293.66, amp: 0.22, decay: 3.1 },
      { freq: 587.33, amp: 0.12, decay: 2.3 },
      { freq: 880.0, amp: 0.06, decay: 1.6 },
    ].forEach((p, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.001, now + idx * 0.04);
      gain.gain.linearRampToValueAtTime(p.amp, now + idx * 0.04 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.04 + p.decay);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + p.decay + 0.08);
    });
  }

  public playEatSipSound(kind: 'eat' | 'drink') {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    if (kind === 'eat') {
      // Gentle ceramic bowl tap + pleasant warm notes
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.11);
        gain.gain.setValueAtTime(0.001, now + idx * 0.11);
        gain.gain.linearRampToValueAtTime(0.11, now + idx * 0.11 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + idx * 0.11 + 0.28);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + idx * 0.11);
        osc.stop(now + idx * 0.11 + 0.32);
      });
    } else {
      // Crisp apple-juice sip chime
      [587.33, 783.99, 987.77].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.001, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.08 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + idx * 0.08 + 0.34);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.38);
      });
    }
  }

  public playDishWashSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Gentle running water rinse sound
    const dur = 0.45;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + dur);
    filter.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.14, now + 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);

    // Sparkling clean porcelain clink + merit chord
    [659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.24 + idx * 0.09);
      gain.gain.setValueAtTime(0.001, now + 0.24 + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.26 + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.15 + idx * 0.09);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + 0.24 + idx * 0.09);
      osc.stop(now + 1.25 + idx * 0.09);
    });
  }

  public playMemorialChimeSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Compassionate descending-then-ascending lotus prayer chime (Cầu Siêu)
    const notes = [
      { freq: 261.63, delay: 0, amp: 0.24, decay: 3.8 },
      { freq: 392.0, delay: 0.18, amp: 0.2, decay: 3.5 },
      { freq: 523.25, delay: 0.36, amp: 0.18, decay: 3.2 },
      { freq: 659.25, delay: 0.56, amp: 0.14, decay: 2.8 },
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.delay);
      gain.gain.setValueAtTime(0.001, now + n.delay);
      gain.gain.linearRampToValueAtTime(n.amp, now + n.delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + n.delay + n.decay);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + n.delay);
      osc.stop(now + n.delay + n.decay + 0.1);
    });
  }

  public playBirdFeedSound() {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;
    const now = ctx.currentTime;

    // Soft seed-scattering rustle
    const dur = 0.24;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1800, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.09, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);

    // Gentle sparrow chirps + soft dove coo
    [
      { f0: 2150, f1: 2750, t: 0.18, dur: 0.08, amp: 0.065 },
      { f0: 2350, f1: 2950, t: 0.31, dur: 0.07, amp: 0.06 },
      { f0: 2050, f1: 2550, t: 0.44, dur: 0.09, amp: 0.055 },
      { f0: 410, f1: 350, t: 0.55, dur: 0.32, amp: 0.09 },
    ].forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f0, now + n.t);
      osc.frequency.exponentialRampToValueAtTime(n.f1, now + n.t + n.dur);
      gain.gain.setValueAtTime(0.001, now + n.t);
      gain.gain.linearRampToValueAtTime(n.amp, now + n.t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + n.t + n.dur + 0.03);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.dur + 0.06);
    });
  }
}

export const zenAudio = new ZenAudioEngine();

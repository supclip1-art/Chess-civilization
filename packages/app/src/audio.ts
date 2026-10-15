// Звук без файлов: всё синтезируется на лету (Web Audio), поэтому нет ни лицензий, ни лишних загрузок.
//  • Музыка — спокойная «таверна»: щипковая лютня (алгоритм Карплуса — Стронга), басовые переборы,
//    мелодия свирели, мягкий бубен и барабан. Размер 6/8, аккорды и мелодия каждый раз складываются заново.
//  • Звуки интерфейса — деревянный щелчок кнопки и шелест перелистываемой бумаги при открытии меню.
// Браузер разрешает звук только после первого касания — до него всё молчит.

type Prefs = { music: boolean; sfx: boolean };
const KEY = 'chessciv.audio';
let prefs: Prefs = { music: true, sfx: true };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* по умолчанию */ }
const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ничего */ } };

let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode, reverb: ConvolverNode;

const ensure = (): AudioContext | null => {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.5 : 0;
  sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 0.6 : 0;
  // тёплая «комната» таверны: короткая искусственная реверберация
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  musicBus.connect(master); musicBus.connect(reverb); reverb.connect(wet); wet.connect(master);
  sfxBus.connect(master);
  return ctx;
};

// ---------- инструменты ----------

const pluckCache = new Map<string, AudioBuffer>();
/** Щипок струны (Карплус — Стронг): шум в линии задержки, которая усредняется и затухает. */
const pluckBuffer = (freq: number, bright: number, secs = 2.2): AudioBuffer => {
  const c = ctx!;
  const id = `${freq.toFixed(2)}:${bright}`;
  const cached = pluckCache.get(id);
  if (cached) return cached;
  const n = Math.floor(c.sampleRate * secs), period = Math.max(2, Math.round(c.sampleRate / freq));
  const buf = c.createBuffer(1, n, c.sampleRate), out = buf.getChannelData(0);
  // возбуждение струны — сглаженный шум: чем ниже нота и мягче звук, тем сильнее сглаживание (без «дребезга»)
  const line = new Float32Array(period);
  const smooth = Math.min(0.9, 0.35 + (1 - bright) * 0.4 + (freq < 150 ? 0.25 : 0));
  let lp = 0;
  for (let i = 0; i < period; i++) { lp = lp * smooth + (Math.random() * 2 - 1) * (1 - smooth); line[i] = lp; }
  let idx = 0, prev = 0;
  // низкие струны глушим быстрее: долгий гул баса и давал тот самый дребезг
  const damp = (0.996 - (1 - bright) * 0.006) * (freq < 150 ? 0.997 : 1);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    const avg = (cur + prev) * 0.5 * damp;
    prev = cur; line[idx] = avg; out[i] = cur;
    peak = Math.max(peak, Math.abs(cur));
    idx = (idx + 1) % period;
  }
  // все ноты одной громкости: случайный шум иногда давал струну заметно громче остальных
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  // мягкое начало и конец, чтобы не было щелчков
  const fade = Math.floor(c.sampleRate * 0.004);
  for (let i = 0; i < fade; i++) out[i] *= i / fade;
  for (let i = 0; i < fade * 10; i++) out[n - 1 - i] *= i / (fade * 10);
  pluckCache.set(id, buf);
  return buf;
};

const pluck = (t: number, freq: number, vol: number, bright = 0.6, pan = 0) => {
  const c = ctx!;
  const src = c.createBufferSource(); src.buffer = pluckBuffer(freq, bright);
  const g = c.createGain(); g.gain.value = vol;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(1200 + bright * 2200, freq * 8);
  const p = c.createStereoPanner(); p.pan.value = pan;
  src.connect(lp); lp.connect(g); g.connect(p); p.connect(musicBus);
  src.start(t); src.stop(t + 2.2);
};

/** Свирель: мягкий треугольник с лёгким вибрато и дыханием. */
const flute = (t: number, freq: number, dur: number, vol: number) => {
  const c = ctx!;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const vib = c.createOscillator(); vib.frequency.value = 5.2;
  const vg = c.createGain(); vg.gain.value = freq * 0.006;
  vib.connect(vg); vg.connect(o.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.06);
  g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.07, dur - 0.08));
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  o.connect(lp); lp.connect(g); g.connect(musicBus);
  o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
};

/** Духовые: волынка/гобой (язычковый тембр) и мягкий рожок для протяжных аккордов. */
const wind = (t: number, freq: number, dur: number, vol: number, kind: 'reed' | 'horn') => {
  const c = ctx!;
  const g = c.createGain();
  const attack = kind === 'reed' ? 0.07 : 0.22;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol * 0.9, t + Math.max(attack + 0.01, dur - 0.15));
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = kind === 'reed' ? Math.min(2600, freq * 5) : Math.min(900, freq * 3); lp.Q.value = kind === 'reed' ? 2.5 : 0.7;
  lp.connect(g); g.connect(musicBus);
  const voices = kind === 'reed' ? [0] : [-4, 4]; // рожок — две чуть расстроенные трубы, звучит теплее
  const vib = c.createOscillator(); vib.frequency.value = kind === 'reed' ? 5.6 : 4.2;
  const vg = c.createGain(); vg.gain.value = freq * (kind === 'reed' ? 0.005 : 0.002);
  vib.connect(vg);
  for (const cents of voices) {
    const o = c.createOscillator(); o.type = kind === 'reed' ? 'sawtooth' : 'sawtooth';
    o.frequency.value = freq; o.detune.value = cents;
    vg.connect(o.frequency);
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  vib.start(t); vib.stop(t + dur + 0.05);
};

let noiseBuf: AudioBuffer | null = null;
const noise = (): AudioBuffer => {
  if (noiseBuf) return noiseBuf;
  const c = ctx!;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
};

/** Шум через фильтр с огибающей — основа бубна, шелеста бумаги и щелчка. */
const burst = (bus: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1) => {
  const c = ctx!;
  const src = c.createBufferSource(); src.buffer = noise();
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
};

/** Мягкий рамочный барабан. */
const drum = (t: number, vol: number) => {
  const c = ctx!;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + 0.32);
  burst(musicBus, t, 0.05, vol * 0.25, 'lowpass', 900);
};

// ---------- музыка ----------

const NOTE = (n: number) => 432 * 2 ** ((n - 69) / 12); // MIDI → Гц, строй ля = 432 Гц (мягче привычных 440)
// аккорды: весёлый соль мажор с ре-миксолидийским привкусом — как плясовая в трактире
const CH: Record<string, number[]> = {
  G: [55, 59, 62], C: [48, 52, 55], D: [50, 54, 57], Em: [52, 55, 59], Am: [45, 48, 52], F: [53, 57, 60],
};
const PROGS = [
  ['G', 'C', 'D', 'G'], ['G', 'D', 'Em', 'C'], ['C', 'G', 'D', 'G'], ['G', 'Em', 'C', 'D'], ['G', 'F', 'C', 'G'], ['Em', 'C', 'G', 'D'],
];
const SCALE = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79]; // соль мажор
const BEAT = 60 / 132 / 2; // восьмая в 6/8: бодрый джиг

let musicOn = false, nextBar = 0, barNo = 0, timer = 0;
let phrase: { prog: string[]; motif: number[] } | null = null;

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** Мотив на такт: 6 восьмых, -1 — пауза, иначе ступень звукоряда (смещение от тона аккорда). */
const newMotif = (): number[] => {
  // прыгучие мотивы: скачки вверх, повторённые ноты, ход к вершине — так звучит радость
  const shapes = [[0, 2, 4, 7, -1, 4], [4, 4, 2, 0, 2, 4], [0, -1, 4, 2, 4, 7], [7, 5, 4, 2, 4, -1], [2, 4, 5, 4, 2, 0], [0, 4, 7, 4, 2, 4]];
  return shapes[rnd(0, shapes.length - 1)];
};

const scheduleBar = (t: number) => {
  if (!phrase || barNo % 8 === 0) phrase = { prog: PROGS[rnd(0, PROGS.length - 1)], motif: newMotif() };
  const chordName = phrase.prog[Math.floor((barNo % 8) / 2) % 4];
  const chord = CH[chordName];
  const [r, th, fi] = chord;
  // бас на 1 и 4 восьмую, лютня перебором
  pluck(t, NOTE(r - 12), 0.26, 0.15, -0.2);
  pluck(t + 3 * BEAT, NOTE(fi - 12), 0.2, 0.15, -0.2);
  const arp = [r, fi, r + 12, fi, th + 12, fi];
  arp.forEach((n, i) => pluck(t + i * BEAT + (i % 3 === 0 ? 0 : 0.008), NOTE(n), i % 3 === 0 ? 0.2 : 0.15, 0.5, 0.25));
  // рожок держит аккорд два такта подряд — духовая «подушка» под лютней
  if (barNo % 2 === 0) { wind(t, NOTE(r), BEAT * 11.5, 0.035, 'horn'); wind(t, NOTE(th), BEAT * 11.5, 0.028, 'horn'); }
  // ударные: барабан на сильные доли, бубен на слабые
  drum(t, 0.28);
  drum(t + 3 * BEAT, 0.16);
  for (const i of [2, 5]) burst(musicBus, t + i * BEAT, 0.12, 0.05, 'highpass', 7000);
  // мелодия: в 3-м и 4-м такте фразы звучит тот же мотив выше (вопрос — ответ), в 8-м — каденция
  const bar = barNo % 8;
  if (bar === 7) { flute(t, NOTE(r + 12), BEAT * 5.5, 0.11); return; }
  if (bar % 4 === 1 && Math.random() < 0.35) return; // дыхание
  const lift = bar % 4 >= 2 ? 2 : 0;
  let rootIdx = SCALE.findIndex((x) => x % 12 === r % 12 && x >= 60);
  if (rootIdx < 0) rootIdx = 6;
  // вторую половину фразы мелодию ведёт гобой-волынка, первую — свирель
  const reedTurn = bar >= 4;
  phrase.motif.forEach((step, i) => {
    if (step < 0) return;
    const idx = Math.min(SCALE.length - 1, Math.max(0, rootIdx + step + lift));
    const len = phrase!.motif[i + 1] === -1 ? BEAT * 1.9 : BEAT * 0.95;
    if (reedTurn) wind(t + i * BEAT, NOTE(SCALE[idx]), len, 0.05, 'reed');
    else flute(t + i * BEAT, NOTE(SCALE[idx]), len, 0.09);
  });
};

const pump = () => {
  if (!ctx || !musicOn) return;
  while (nextBar < ctx.currentTime + 0.6) { scheduleBar(nextBar); nextBar += 6 * BEAT; barNo++; }
};

const startMusic = () => {
  if (!ensure() || musicOn || !prefs.music) return;
  musicOn = true;
  nextBar = ctx!.currentTime + 0.15; barNo = 0; phrase = null;
  timer = window.setInterval(pump, 120);
  pump();
};
const stopMusic = () => { musicOn = false; clearInterval(timer); };

// ---------- звуки интерфейса ----------

/** Деревянный щелчок кнопки. */
export const click = (): void => {
  if (!prefs.sfx || !ensure() || ctx!.state !== 'running') return;
  const t = ctx!.currentTime;
  burst(sfxBus, t, 0.035, 0.5, 'bandpass', 2600, 1800, 3);
  const o = ctx!.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.03);
  const g = ctx!.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.05);
};

/** Шелест перелистываемой страницы: два мягких шороха с уходящим вверх фильтром. */
export const page = (): void => {
  if (!prefs.sfx || !ensure() || ctx!.state !== 'running') return;
  const t = ctx!.currentTime;
  burst(sfxBus, t, 0.16, 0.22, 'bandpass', 900, 3800, 0.8);
  burst(sfxBus, t + 0.09, 0.2, 0.16, 'bandpass', 2400, 6000, 0.7);
  burst(sfxBus, t + 0.02, 0.08, 0.06, 'highpass', 6000);
};

/** Сундук: скрип крышки и звон наград (у редких — выше и дольше). */
export const chestOpen = (rarity: 'common' | 'rare' | 'epic'): void => {
  if (!prefs.sfx || !ensure() || ctx!.state !== 'running') return;
  const c = ctx!, t = c.currentTime + 0.55; // звук — когда крышка открывается
  burst(sfxBus, t - 0.5, 0.45, 0.12, 'bandpass', 300, 700, 6); // скрип
  burst(sfxBus, t, 0.12, 0.3, 'lowpass', 600);                 // крышка стукнула
  const notes = rarity === 'epic' ? [76, 79, 83, 88, 91] : rarity === 'rare' ? [76, 80, 83, 88] : [79, 83, 86];
  notes.forEach((n, i) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = NOTE(n);
    const g = c.createGain(); const at = t + 0.08 + i * 0.07;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.16, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g); g.connect(sfxBus); o.start(at); o.stop(at + 1);
  });
};

// ---------- управление ----------

export const audioPrefs = (): Prefs => ({ ...prefs });

export const setMusic = (on: boolean): void => {
  prefs.music = on; savePrefs();
  if (!ensure()) return;
  musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx!.currentTime, 0.2);
  if (on) startMusic(); else window.setTimeout(() => { if (!prefs.music) stopMusic(); }, 600);
};

export const setSfx = (on: boolean): void => {
  prefs.sfx = on; savePrefs();
  if (ensure()) sfxBus.gain.value = on ? 0.6 : 0;
};

/** Подключить звук: первое касание будит аудио и запускает музыку; кнопки щёлкают; в фоне — тишина. */
export const initAudio = (): void => {
  const wake = () => {
    if (!ensure()) return;
    void ctx!.resume().then(() => { if (prefs.music) startMusic(); });
  };
  document.addEventListener('pointerdown', wake, { capture: true });
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button, [data-a], .nation, select, label')) click();
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { stopMusic(); void ctx.suspend(); } else void ctx.resume().then(() => { if (prefs.music) startMusic(); });
  });
};

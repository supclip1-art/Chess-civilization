// Звук без файлов: всё синтезируется на лету (Web Audio), поэтому нет ни лицензий, ни лишних загрузок.
//  • Музыка — пять стилей: северный фолк, аравийский мотив, электроника, восточный сад, лоу-фай.
//    Струны — алгоритм Карплуса — Стронга, остальное — осцилляторы и шум. Аккорды и мелодия каждый раз складываются заново.
//  • Звуки интерфейса — деревянный щелчок кнопки и шелест перелистываемой бумаги при открытии меню.
// Браузер разрешает звук только после первого касания — до него всё молчит.

type Prefs = { music: boolean; sfx: boolean; style: number };
const KEY = 'chessciv.audio';
let prefs: Prefs = { music: true, sfx: true, style: 1 };
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
  musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.9 : 0;
  sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 0.6 : 0;
  // тёплая «комната» таверны: короткая искусственная реверберация
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.34;
  // общий фильтр музыки: срезаем верха, чтобы звук был тёплым и не резал слух
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2300; tone.Q.value = 0.5;
  const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1500; shelf.gain.value = -5;
  musicBus.connect(shelf); shelf.connect(tone); tone.connect(master); tone.connect(reverb); reverb.connect(wet); wet.connect(master);
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
// Пять вариантов в разных стилях (выбираются в меню): северный фолк, аравийский мотив, современная электроника,
// восточный сад и лоу-фай. Строй ля = 432 Гц, верхние частоты срезаны общим фильтром, ритмичного баса нет.
// Каждые 8 тактов — новая фраза: аккорды по два такта, мелодия плавно переходит между звуками аккордов,
// 4-й такт — вздох, в конце — тоника. Иногда мелодия молчит — передышка.

const NOTE = (n: number) => 432 * 2 ** ((n - 69) / 12); // MIDI → Гц, строй ля = 432 Гц

/** Смычковые: тёплая «подушка» (медленная атака) или напевная скрипка (быстрее, с вибрато). */
const bowed = (t: number, freq: number, dur: number, vol: number, solo: boolean, dark = 1) => {
  const c = ctx!;
  const g = c.createGain();
  const attack = solo ? 0.12 : 0.7, release = solo ? 0.15 : 0.9;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = (solo ? Math.min(2200, freq * 4) : Math.min(900, freq * 3)) * dark; lp.Q.value = 0.7;
  lp.connect(g); g.connect(musicBus);
  const vib = c.createOscillator(); vib.frequency.value = solo ? 5.2 : 4.5;
  const vg = c.createGain();
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(freq * (solo ? 0.005 : 0.002), t + Math.min(0.45, dur / 2));
  vib.connect(vg);
  for (const cents of solo ? [-3, 3] : [-6, 0, 6]) {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
    vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  vib.start(t); vib.stop(t + dur + 0.05);
};

/** Дыхание духового (ней, сякухати): шум, отфильтрованный вокруг высоты ноты. */
const breath = (t: number, freq: number, dur: number, vol: number) => {
  const c = ctx!;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 8;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.linearRampToValueAtTime(vol * 0.4, t + 0.25);
  g.gain.setValueAtTime(vol * 0.4, t + Math.max(0.26, dur - 0.1)); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
};
const ney = (t: number, freq: number, dur: number, vol: number) => { flute(t, freq, dur, vol); breath(t, freq, dur, vol * 2.2); };

/** Электропиано (родес): синус с мягким призвуком октавы, долгое затухание. */
const epiano = (t: number, freq: number, vol: number, len = 2.8) => {
  const c = ctx!;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(musicBus);
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.connect(g);
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
  const g2 = c.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
  o2.connect(g2); g2.connect(g);
  o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
};

/** Синтезатор: пилы за фильтром. pad — широкий и медленный, pluck — короткий щипок для арпеджио, lead — певучая мелодия. */
const synth = (t: number, freq: number, dur: number, vol: number, kind: 'pad' | 'pluck' | 'lead') => {
  const c = ctx!;
  const g = c.createGain();
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'pluck' ? 3 : 1;
  if (kind === 'pad') {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 1.2); g.gain.setValueAtTime(vol, t + Math.max(1.2, dur - 1.2)); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100, t + dur / 2); lp.frequency.linearRampToValueAtTime(600, t + dur);
  } else if (kind === 'pluck') {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.frequency.setValueAtTime(freq * 6, t); lp.frequency.exponentialRampToValueAtTime(freq * 1.2, t + dur * 0.8);
  } else {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.06, dur - 0.1)); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.frequency.value = Math.min(1800, freq * 3);
  }
  lp.connect(g); g.connect(musicBus);
  const det = kind === 'pad' ? [-12, -4, 4, 12] : kind === 'pluck' ? [-5, 5] : [0];
  for (const cents of det) {
    const o = c.createOscillator(); o.type = kind === 'lead' ? 'triangle' : 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
    if (kind === 'lead') { // лёгкое вибрато
      const v = c.createOscillator(); v.frequency.value = 5; const vg = c.createGain(); vg.gain.value = freq * 0.004;
      v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur + 0.05);
    }
    o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
};

/** Тёплый бас: долгая мягкая нота на корне аккорда (не щипок, без ритма), только низ — фильтр на 260 Гц. */
const softBass = (t: number, freq: number, dur: number, vol: number) => {
  const c = ctx!;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.08);
  g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.1, dur - 0.3)); g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.5;
  lp.connect(g); g.connect(musicBus);
  for (const [type, m] of [['sine', 1], ['triangle', 0.5]] as const) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const og = c.createGain(); og.gain.value = m; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
};

/** Мягкая «бочка» электроники и лоу-фая. */
const kick = (t: number, vol: number) => {
  const c = ctx!;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.42);
};
/** Приглушённый малый барабан / хлопок. */
const snare = (t: number, vol: number) => burst(musicBus, t, 0.16, vol, 'bandpass', 1300, 900, 0.9);
/** Тек дарбуки — сухой удар по краю. */
const tek = (t: number, vol: number) => burst(musicBus, t, 0.07, vol, 'bandpass', 1100, 800, 3);
/** Низкий удар гонга или храмового колокола. */
const gong = (t: number, freq: number, vol: number) => {
  const c = ctx!;
  for (const [m, v] of [[1, 1], [2.76, 0.3], [5.4, 0.1]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 4 / m);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 4.1 / m);
  }
};

type Voice = 'fiddle' | 'flute' | 'ney' | 'oud' | 'koto' | 'lead' | 'epiano' | 'rest';
type Style = {
  id: number; name: string;
  chords: Record<string, number[]>; // звуки аккордов в малой октаве (MIDI)
  progs: string[][]; // аккорды фразы, по два такта каждый
  tonic: string;
  scale: number[]; // звуки мелодии
  beat: number; beats: number; // длительность доли и долей в такте
  rhythms: number[][]; // ритмы мелодии в долях (сумма = beats)
  voices: Voice[]; // голос мелодии по фразам, по кругу
  accomp: (t: number, chord: number[], bar: number, st: Style) => void;
};

export const MUSIC_STYLES: Style[] = [
  { // 1. Северный фолк: ля минор, бойкий 6/8, скрипка и вистл, гитара боем и бойран
    id: 1, name: 'Northern folk',
    chords: { Am: [45, 48, 52], G: [43, 47, 50], C: [48, 52, 55], Em: [52, 55, 59], F: [41, 45, 48], Dm: [50, 53, 57] },
    progs: [['Am', 'G', 'Am', 'Em'], ['Am', 'C', 'G', 'Am'], ['Am', 'F', 'C', 'G'], ['F', 'G', 'Am', 'Am'], ['Am', 'Dm', 'Em', 'Am']], tonic: 'Am',
    scale: [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76],
    beat: 0.24, beats: 6, rhythms: [[2, 1, 2, 1], [1, 1, 1, 3], [3, 1, 1, 1], [2, 1, 3], [1, 1, 1, 1, 1, 1]],
    voices: ['fiddle', 'flute', 'fiddle', 'rest'],
    accomp: (t, [r, th, fi], bar, st) => {
      // гитара: бой на сильные доли, без низкого баса
      for (const at of [0, 3]) for (const [i, n] of [fi, r + 12, th + 12, fi + 12].entries()) pluck(t + at * st.beat + i * 0.02, NOTE(n), at ? 0.045 : 0.06, 0.3, -0.3 + i * 0.18);
      pluck(t + 5 * st.beat, NOTE(th + 12), 0.035, 0.3, 0.2);
      // бойран: глухо на 1 и 4, легко на 3 и 6
      drum(t, 0.1); drum(t + 3 * st.beat, 0.07); tek(t + 2 * st.beat, 0.05); tek(t + 5 * st.beat, 0.05);
      if (bar % 2 === 0) bowed(t, NOTE(r + 12), st.beat * st.beats * 2, 0.012, false);
    },
  },
  { // 2. Аравийский мотив: макам хиджаз от ре, уд, ней, дарбука, гудящий бурдон
    id: 2, name: 'Arabian nights',
    chords: { D: [50, 54, 57], Gm: [43, 46, 50], Cm: [48, 51, 55], Eb: [51, 55, 58] },
    progs: [['D', 'D', 'Gm', 'D'], ['D', 'Eb', 'D', 'D'], ['Gm', 'Cm', 'D', 'D'], ['D', 'Gm', 'Eb', 'D']], tonic: 'D',
    scale: [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79],
    beat: 0.21, beats: 8, rhythms: [[1, 1, 2, 4], [2, 1, 1, 4], [3, 1, 2, 2], [4, 4], [2, 2, 1, 1, 2], [1, 1, 1, 1, 4]],
    voices: ['ney', 'oud', 'ney', 'rest'],
    accomp: (t, [r, th, fi], bar, st) => {
      // максум: дум — тек — . — тек — дум — . — тек — .
      drum(t, 0.12); tek(t + 1 * st.beat, 0.07); tek(t + 3 * st.beat, 0.06); drum(t + 4 * st.beat, 0.09); tek(t + 6 * st.beat, 0.07);
      if (Math.random() < 0.5) tek(t + 7 * st.beat, 0.035);
      // уд: короткие фигуры по звукам аккорда
      const figs = [[0, 2, 3], [0, 3, 5, 6], [0, 2, 4, 6]];
      figs[bar % figs.length].forEach((at, i) => pluck(t + at * st.beat, NOTE([r + 12, fi + 12, th + 12, r + 24][i % 4]), 0.08, 0.38, i % 2 ? 0.25 : -0.2));
      // бурдон на тонике
      if (bar % 4 === 0) bowed(t, NOTE(50), st.beat * st.beats * 4, 0.02, false, 0.8);
    },
  },
  { // 3. Электроника: ре минор, широкие синтезаторные пэды, арпеджио, мягкая бочка, плавный саб-бас
    id: 3, name: 'Electronic',
    chords: { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55], Gm: [43, 46, 50] },
    progs: [['Dm', 'Bb', 'F', 'C'], ['Bb', 'F', 'C', 'Dm'], ['Dm', 'F', 'C', 'Bb'], ['Gm', 'Bb', 'Dm', 'C']], tonic: 'Dm',
    scale: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79],
    beat: 0.22, beats: 8, rhythms: [[2, 2, 4], [3, 3, 2], [4, 2, 2], [1, 1, 2, 4], [6, 2], [8]],
    voices: ['lead', 'rest', 'lead', 'epiano'],
    accomp: (t, [r, th, fi], bar, st) => {
      const len = st.beat * st.beats;
      if (bar % 2 === 0) { for (const n of [r + 12, th + 12, fi + 12]) synth(t, NOTE(n), len * 2, 0.018, 'pad'); synth(t, NOTE(r - 12), len * 2, 0.03, 'pad'); }
      const arp = [r + 12, fi + 12, th + 24, fi + 12, r + 24, fi + 12, th + 24, fi + 12];
      arp.forEach((n, i) => synth(t + i * st.beat, NOTE(n), 0.35, i % 2 ? 0.025 : 0.035, 'pluck'));
      kick(t, 0.2); kick(t + 4 * st.beat, 0.16);
      if (bar % 2 === 1) snare(t + 4 * st.beat, 0.05);
    },
  },
  { // 4. Восточный сад: пентатоника, кото, бамбуковая флейта, далёкий гонг
    id: 4, name: 'Eastern garden',
    chords: { D: [50, 57, 62], Bm: [47, 54, 59], E: [52, 59, 64], A: [45, 52, 57] },
    progs: [['D', 'Bm', 'E', 'A'], ['Bm', 'E', 'D', 'D'], ['D', 'A', 'Bm', 'D'], ['E', 'Bm', 'A', 'D']], tonic: 'D',
    scale: [62, 64, 66, 69, 71, 74, 76, 78, 81],
    beat: 0.34, beats: 8, rhythms: [[2, 2, 4], [4, 2, 2], [3, 1, 4], [8], [2, 6], [1, 1, 2, 4]],
    voices: ['ney', 'koto', 'rest', 'ney'],
    accomp: (t, [r, fi, oc], bar, st) => {
      const pats = [[0, 1, 2, 4], [0, 2, 3, 6], [0, 1, 4, 5], [0, 3, 4, 6]];
      pats[bar % pats.length].forEach((at, i) => pluck(t + at * st.beat, NOTE([r + 12, fi + 12, oc + 12, fi + 24][i]), 0.08, 0.45, i % 2 ? 0.3 : -0.25));
      if (bar % 4 === 0) gong(t, NOTE(r - 12), 0.06);
    },
  },
  { // 5. Лоу-фай: джазовые септаккорды на родесе, ленивый бит с оттяжкой
    id: 5, name: 'Lo-fi',
    chords: { Dmaj7: [50, 54, 57, 61], Bm7: [47, 50, 54, 57], Em7: [52, 55, 59, 62], A7: [45, 49, 52, 55], Gmaj7: [43, 47, 50, 54], 'F#m7': [54, 57, 61, 64] },
    progs: [['Gmaj7', 'F#m7', 'Em7', 'A7'], ['Dmaj7', 'Bm7', 'Em7', 'A7'], ['Gmaj7', 'A7', 'F#m7', 'Bm7'], ['Em7', 'A7', 'Dmaj7', 'Dmaj7']], tonic: 'Dmaj7',
    scale: [62, 64, 66, 67, 69, 71, 73, 74, 76, 78],
    beat: 0.3, beats: 8, rhythms: [[3, 1, 4], [2, 2, 4], [1, 2, 1, 4], [6, 2], [8]],
    voices: ['epiano', 'flute', 'rest', 'epiano'],
    accomp: (t, ch, bar, st) => {
      const swing = st.beat * 0.16;
      ch.forEach((n, i) => epiano(t + i * 0.025, NOTE(n + 12), 0.04, 3));
      if (bar % 2 === 1) ch.slice(1).forEach((n, i) => epiano(t + 5 * st.beat + swing + i * 0.02, NOTE(n + 12), 0.025, 1.6));
      synth(t, NOTE(ch[0] - 12), st.beat * st.beats, 0.035, 'pad');
      kick(t, 0.17); kick(t + 3 * st.beat + swing, 0.11); snare(t + 2 * st.beat, 0.06); snare(t + 6 * st.beat, 0.06);
      for (let i = 1; i < 8; i += 2) burst(musicBus, t + i * st.beat + swing, 0.04, 0.012, 'bandpass', 2000, 1800, 2);
    },
  },
];
let styleNo = prefs.style || 1;
const style = () => MUSIC_STYLES.find((x) => x.id === styleNo) ?? MUSIC_STYLES[0];

let musicOn = false, nextBar = 0, barNo = 0, timer = 0;
type Phrase = { prog: string[]; notes: { at: number; len: number; n: number }[][]; voice: Voice };
let phrase: Phrase | null = null, phraseNo = 0, lastPitch = 69;

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(xs: T[]) => xs[rnd(0, xs.length - 1)];

/** Звук аккорда в мелодическом диапазоне, ближайший к предыдущей ноте. */
const nearestChordTone = (st: Style, chord: number[], prev: number) => {
  const pcs = chord.map((n) => n % 12);
  const opts = st.scale.filter((n) => pcs.includes(n % 12));
  return (opts.length ? opts : st.scale).slice().sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0];
};

const makePhrase = (): Phrase => {
  const st = style();
  const prog = pick(st.progs);
  const rhythmA = pick(st.rhythms), rhythmB = pick(st.rhythms);
  const notes: Phrase['notes'] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = st.chords[prog[Math.floor(bar / 2)]];
    const next = st.chords[prog[Math.min(3, Math.floor((bar + 1) / 2))]];
    if (bar === 7) { // каденция: долгая тоника
      const tonic = nearestChordTone(st, st.chords[st.tonic], lastPitch);
      notes.push([{ at: 0, len: st.beats, n: tonic }]); lastPitch = tonic; continue;
    }
    const rhythm = bar % 4 === 3 ? [st.beats] : bar % 2 === 0 ? rhythmA : rhythmB; // 4-й такт — вздох
    let n = nearestChordTone(st, chord, lastPitch + rnd(-2, 2));
    const goal = nearestChordTone(st, next, n);
    const out: { at: number; len: number; n: number }[] = [];
    let at = 0;
    for (const len of rhythm) {
      out.push({ at, len, n });
      at += len;
      // шаг по ладу к следующему аккорду
      const i = st.scale.indexOf(n);
      const dir = goal > n ? 1 : goal < n ? -1 : pick([-1, 1]);
      n = st.scale[Math.max(0, Math.min(st.scale.length - 1, i + dir))];
    }
    lastPitch = out[out.length - 1].n;
    notes.push(out);
  }
  const voice = st.voices[phraseNo % st.voices.length];
  phraseNo++;
  return { prog, notes, voice };
};

const scheduleBar = (t: number) => {
  const st = style();
  if (!phrase || barNo % 8 === 0) phrase = makePhrase();
  const bar = barNo % 8;
  const chord = st.chords[phrase.prog[Math.floor(bar / 2)]];
  st.accomp(t, chord, bar, st);
  // бас: корень аккорда во второй октаве, на два такта, если аккорд не меняется
  if (bar % 2 === 0) { let r = chord[0]; while (r > 45) r -= 12; while (r < 33) r += 12; softBass(t, NOTE(r), st.beat * st.beats * 2, 0.03); }
  if (phrase.voice === 'rest') return;
  for (const x of phrase.notes[bar]) {
    const at = t + x.at * st.beat, dur = x.len * st.beat * 0.96;
    const f = NOTE(x.n);
    if (phrase.voice === 'fiddle') bowed(at, f, dur, 0.04, true);
    else if (phrase.voice === 'flute') flute(at, f, dur, 0.07);
    else if (phrase.voice === 'ney') ney(at, f, dur, 0.055);
    else if (phrase.voice === 'oud') pluck(at, f, 0.13, 0.4);
    else if (phrase.voice === 'koto') pluck(at, f, 0.12, 0.5);
    else if (phrase.voice === 'lead') synth(at, f, dur, 0.05, 'lead');
    else if (phrase.voice === 'epiano') epiano(at, f, 0.075, Math.max(1.5, dur + 0.8));
  }
};

const pump = () => {
  if (!ctx || !musicOn) return;
  while (nextBar < ctx.currentTime + 0.8) { scheduleBar(nextBar); nextBar += style().beats * style().beat; barNo++; }
};

const startMusic = () => {
  if (!ensure() || musicOn || !prefs.music) return;
  musicOn = true;
  nextBar = ctx!.currentTime + 0.15; barNo = 0; phrase = null;
  timer = window.setInterval(pump, 150);
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
  musicBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx!.currentTime, 0.2);
  if (on) startMusic(); else window.setTimeout(() => { if (!prefs.music) stopMusic(); }, 600);
};

/** Выбрать вариант музыки: новая фраза начнётся со следующего такта. */
export const setMusicStyle = (id: number): void => {
  prefs.style = id; styleNo = id; savePrefs();
  phrase = null; barNo = 0;
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

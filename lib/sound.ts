/**
 * 早押しの効果音。音声ファイルは使わず、Web Audio API でその場で音を作る。
 *
 * スマホのブラウザは、画面を一度タップした流れの中でないと音を出させてくれない。
 * なので「スタート！」などのボタンを押したときに unlockSound() を呼んでおき、
 * 押された合図が届いたときに playPinpon() で鳴らす。
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** ボタンを押したときに呼ぶ。これで以降は合図だけで音が鳴らせるようになる */
export function unlockSound() {
  const c = audio();
  if (!c) return;
  if (c.state !== "running") void c.resume();
  // iPhone は「実際に何か鳴らす」までロックが外れないので、無音を一瞬だけ流す
  const silent = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = silent;
  src.connect(c.destination);
  src.start();
}

/**
 * チャイムの1音。基本の音に少し高い倍音を重ね、叩いた瞬間に大きく、ゆっくり消えていく形にする。
 */
function chime(c: AudioContext, freq: number, start: number, length: number, volume: number) {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, start + length);
  out.connect(c.destination);

  // [倍率, 大きさ]：基本の音 + 金属っぽい響き
  for (const [ratio, level] of [
    [1, 1],
    [2, 0.25],
    [3, 0.08],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + length);
  }
}

/** 「ピンポーン」。高い音（ピン）のあとに低い音（ポーン）を長めに響かせる */
export function playPinpon() {
  const c = audio();
  if (!c) return;
  if (c.state !== "running") void c.resume();
  const t = c.currentTime + 0.02;
  chime(c, 1046.5, t, 0.6, 0.5); // ド（高い）
  chime(c, 830.6, t + 0.28, 1.4, 0.5); // ソ#
}

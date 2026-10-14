// Stockfish 18 lite (WASM, один поток) в Web Worker. Файлы движка лежат рядом с приложением
// в папке engine/, загрузчик сам находит .wasm с тем же именем.

export const ENGINE_URL = 'engine/stockfish-18-lite-single.js';

/** ELO генерала → бюджет узлов на ход и доля случайных ходов (для слабых генералов). Черновые значения. */
export const profile = (elo: number): { nodes: number; blunder: number } => ({
  nodes: Math.round(Math.max(100, Math.min(22000, 150 * Math.pow(2, (elo - 600) / 250)))),
  blunder: elo < 1600 ? Math.min(0.4, (1600 - elo) / 2500) : 0,
});

export class Engine {
  private worker: Worker;
  private listeners: ((line: string) => void)[] = [];

  private constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (e) => { const line = String(e.data); for (const f of [...this.listeners]) f(line); };
  }

  static async load(timeoutMs = 30000): Promise<Engine> {
    const e = new Engine(new Worker(ENGINE_URL));
    const failed = new Promise<never>((_, reject) => {
      e.worker.onerror = (ev) => reject(new Error(`engine failed to load: ${ev.message || 'worker error'}`));
    });
    e.send('uci');
    const ok = await Promise.race([e.waitFor((l) => l === 'uciok', timeoutMs), failed]);
    if (!ok) throw new Error('engine did not answer in time');
    e.send('setoption name Threads value 1');
    e.send('setoption name Hash value 16');
    await e.ready();
    return e;
  }

  send(cmd: string): void { this.worker.postMessage(cmd); }

  waitFor(pred: (line: string) => boolean, ms = 0): Promise<string | null> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const f = (line: string) => {
        if (!pred(line)) return;
        this.listeners = this.listeners.filter((x) => x !== f);
        if (timer) clearTimeout(timer);
        resolve(line);
      };
      this.listeners.push(f);
      if (ms) timer = setTimeout(() => { this.listeners = this.listeners.filter((x) => x !== f); resolve(null); }, ms);
    });
  }

  async ready(): Promise<void> { this.send('isready'); await this.waitFor((l) => l === 'readyok', 10000); }

  /** Поиск с лимитом узлов. position — строка после "position ", например "fen <...> moves e2e4". */
  async search(position: string, nodes: number): Promise<{ best: string; nodes: number; ms: number }> {
    let seen = 0;
    const tap = (l: string) => { const m = l.match(/\bnodes (\d+)/); if (m) seen = +m[1]; };
    this.listeners.push(tap);
    this.send(`position ${position}`);
    const t = performance.now();
    this.send(`go nodes ${nodes}`);
    const line = await this.waitFor((l) => l.startsWith('bestmove'), 60000);
    this.listeners = this.listeners.filter((x) => x !== tap);
    return { best: line?.split(/\s+/)[1] ?? '(none)', nodes: seen, ms: performance.now() - t };
  }

  /** Текущая позиция и шахи — через отладочную команду "d". */
  async inspect(position: string): Promise<{ fen: string; inCheck: boolean }> {
    this.send(`position ${position}`);
    let fen = '';
    let inCheck = false;
    const tap = (l: string) => {
      if (l.startsWith('Fen: ')) fen = l.slice(5).trim();
      if (l.startsWith('Checkers:')) inCheck = l.slice(9).trim().length > 0;
    };
    this.listeners.push(tap);
    this.send('d');
    await this.waitFor((l) => l.startsWith('Checkers:'), 5000);
    this.listeners = this.listeners.filter((x) => x !== tap);
    return { fen, inCheck };
  }

  quit(): void { this.send('quit'); this.worker.terminate(); }
}

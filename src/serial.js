// Comunicação com o ESP32 via Web Serial (Chrome/Edge). Protocolo idêntico ao Cubotino_GUI.py:
//   PC -> robô:  <U1R3...(Nf)>\n  (solução)   [start]  [stop]  [led_on]  [led_off]
//   robô -> PC:  eco <...>, start, i_N (progresso), solved(t), stop(t), conn

export class RobotLink {
  constructor(handlers) { this.h = handlers; this.port = null; this.pending = ''; }

  static get supported() { return 'serial' in navigator; }
  get connected() { return !!this.port; }

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.reading = true;
    this.read();
    await this.send('[led_on]');
  }

  async disconnect() {
    this.reading = false;
    try { await this.send('[stop]'); await this.send('[led_off]'); } catch {}
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); await this.port?.close(); } catch {}
    this.port = null;
  }

  send(text) { return this.writer.write(new TextEncoder().encode(text + '\n')); }

  /** Envia a solução; o início (`[start]`) só ocorre quando o robô devolve exatamente a mesma string. */
  async sendSolution(solution, count) {
    this.expected = `<${solution.replace(/\s+/g, '')}(${count}f)>`;
    await this.send(this.expected);
  }
  start() { return this.send('[start]'); }
  stop() { return this.send('[stop]'); }

  async read() {
    const dec = new TextDecoderStream();
    this.port.readable.pipeTo(dec.writable).catch(() => {});
    this.reader = dec.readable.getReader();
    try {
      while (this.reading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.pending += value;
        let nl;
        while ((nl = this.pending.indexOf('\n')) >= 0) {
          const line = this.pending.slice(0, nl).trim(); this.pending = this.pending.slice(nl + 1);
          if (line) this.handle(line);
        }
      }
    } catch (e) { this.h.onLog?.('Serial: ' + e.message); }
  }

  handle(line) {
    const t = (s) => { const m = s.match(/\(([^)]*)\)/); return m ? m[1] : ''; };
    if (line.includes('<') && line.includes('>')) {
      if (line === this.expected) { this.h.onLog?.('Robô confirmou a solução; iniciando…'); this.start(); }
      else this.h.onLog?.('A string recebida pelo robô difere da enviada: ' + line);
    } else if (line.startsWith('i_')) this.h.onProgress?.(+line.slice(2));
    else if (line.includes('solved')) this.h.onSolved?.(t(line));
    else if (line.includes('stop')) this.h.onStopped?.(t(line));
    else if (line.includes('start')) this.h.onLog?.('Robô iniciou.');
    else if (line.includes('conn')) this.h.onLog?.('ESP32 conectado.');
    else this.h.onLog?.(line);
  }
}

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export class CoreBridge {
  constructor() {
    this.pending = new Map();
    this.queue = [];
    this.inFlight = null;
    this.sequence = 0;
    this.failed = null;
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'CO_MATH_CONFIG_HOME', 'CO_MATH_PROJECTS_HOME'].includes(name)));
    this.process = spawn(process.env.CO_MATH_PYTHON || 'python3', ['-u', '-m', 'harness.co_math.bridge'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...environment, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // The Core never needs provider credentials.
    this.process.on('error', () => this.fail('无法启动 Python Core。请设置 CO_MATH_PYTHON 为 Python 3.10 或更新版本。'));
    this.process.on('exit', () => this.fail('Python Core 已停止。请检查 Python 版本与依赖，再重启应用。'));
    this.process.stdin.on('error', () => this.fail('Python Core 连接已中断。'));
    this.process.stderr.on('data', () => { /* Diagnostics are surfaced without arbitrary subprocess text. */ });
    createInterface({ input: this.process.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(Object.assign(new Error(message.error), { status: 400 }));
        else pending.resolve(message.result);
        this.inFlight = null;
        this.pump();
      } catch { this.fail('Python Core 返回了无法读取的数据。'); }
    });
  }

  fail(message) {
    this.failed = new Error(message);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(this.failed); }
    this.pending.clear();
    this.queue = []; this.inFlight = null;
  }

  call(method, params = {}) {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.queue.push({ id, method, params });
      this.pump();
    });
  }

  pump() {
    if (this.failed || this.inFlight !== null || !this.queue.length) return;
    const request = this.queue.shift();
    this.inFlight = request.id;
    const pending = this.pending.get(request.id);
    pending.timer = setTimeout(() => {
        this.fail('Python Core 响应超时，请重新打开项目核对实际状态。');
        this.process.kill();
      }, 30_000);
    this.process.stdin.write(JSON.stringify(request) + '\n');
  }

  close() { this.process.stdin.end(); this.process.kill(); }
}

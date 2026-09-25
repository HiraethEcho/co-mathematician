export class Runs {
  constructor(core, model) {
    this.core = core; this.model = model;
    this.active = new Map(); this.listeners = new Map();
  }

  publish(projectId, message) {
    for (const listener of this.listeners.get(projectId) || []) listener(message);
  }

  subscribe(projectId, listener) {
    if (!this.listeners.has(projectId)) this.listeners.set(projectId, new Set());
    this.listeners.get(projectId).add(listener);
    return () => {
      this.listeners.get(projectId)?.delete(listener);
      if (!this.listeners.get(projectId)?.size) this.listeners.delete(projectId);
    };
  }

  async start(projectId, input) {
    if (this.active.has(projectId)) throw Object.assign(new Error('这个项目正在生成回答，请等待或停止当前回答。'), { status: 409 });
    if (this.active.size >= 3) throw Object.assign(new Error('同时最多运行三个项目，请等待现有回答结束。'), { status: 409 });
    if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 20000 || !Array.isArray(input.files) || input.files.length > 6 || input.files.some(f => typeof f !== 'string')) {
      throw Object.assign(new Error('问题不能为空，可附带最多六份材料。'), { status: 400 });
    }
    const controller = new AbortController();
    const entry = { controller, message: null, completion: null };
    this.active.set(projectId, entry);
    try {
      const selection = await this.model.selected(input);
      const project = await this.core.call('project.read', { projectId });
      const main = `${project.workspace.split(/[\\/]/).at(-1)}/project/PROJECT.md`;
      const sources = [...new Set([main, ...input.files])];
      const documents = [];
      let characters = 0;
      for (const path of sources) {
        const document = await this.core.call('file.read', { projectId, path });
        characters += document.content.length;
        if (characters > 22000) throw Object.assign(new Error('所选材料超过 22,000 个字符，请减少材料后发送。'), { status: 400 });
        documents.push(document);
      }
      const conversation = await this.core.call('chat.read', { projectId });
      const history = [];
      let remaining = 12000;
      for (const message of conversation.messages.slice(-12).reverse()) {
        if (message.role === 'assistant' && message.status !== 'succeeded') continue;
        if (message.content.length > remaining) break;
        history.unshift({ role: message.role, content: message.content });
        remaining -= message.content.length;
      }
      controller.signal.throwIfAborted();
      entry.message = await this.core.call('chat.begin', { projectId, content: input.content, sources, model: selection.model.id, profileName: selection.profileName, provider: selection.provider });
      entry.completion = this.execute(projectId, entry, { selection, question: input.content, documents, history });
      return entry.message;
    } catch (error) { this.active.delete(projectId); throw error; }
  }

  async execute(projectId, entry, context) {
    let saving = Promise.resolve();
    const persist = () => {
      const state = { projectId, runId: entry.message.id, ...entry.message };
      saving = saving.then(() => this.core.call('chat.update', state));
      return saving;
    };
    let dirty = false;
    let persistenceError = null;
    const interval = setInterval(() => {
      if (!dirty || persistenceError) return;
      dirty = false;
      persist().catch(error => { persistenceError = error; entry.controller.abort(); });
    }, 1000);
    const timeout = setTimeout(() => entry.controller.abort(new Error('本次回答超过十分钟，已停止。')), 600_000);
    try {
      await this.model.generate({ ...context, signal: entry.controller.signal, onText: delta => {
        entry.message.content += delta;
        if (entry.message.content.length > 100000) entry.controller.abort(new Error('回答过长，已停止。'));
        dirty = true; this.publish(projectId, entry.message);
      } });
      if (!entry.message.content.trim()) throw new Error('模型没有返回文字，请检查模型设置。');
      entry.message.status = 'succeeded';
    } catch (error) {
      entry.message.status = entry.controller.signal.aborted && !persistenceError ? 'cancelled' : 'failed';
      entry.message.error = persistenceError ? '保存回答失败，请复制当前文字后检查项目目录。' : entry.controller.signal.aborted ? entry.controller.signal.reason?.message || '已停止生成，已有文字保留。' : error.message;
    } finally {
      clearInterval(interval); clearTimeout(timeout);
      try { await saving; await persist(); }
      catch { entry.message.status = 'failed'; entry.message.error = '保存回答失败，请复制当前文字。'; }
      this.publish(projectId, entry.message);
      this.active.delete(projectId);
    }
  }

  cancel(projectId) {
    const entry = this.active.get(projectId);
    if (entry) entry.controller.abort(new Error('已停止生成，已有文字保留。'));
    return { stopped: !!entry };
  }

  async close() {
    for (const entry of this.active.values()) entry.controller.abort(new Error('应用已关闭，已有文字保留。'));
    await Promise.allSettled([...this.active.values()].map(entry => entry.completion));
  }
}

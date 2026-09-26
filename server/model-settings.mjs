import { mkdir, readFile, lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const providers = ['custom', 'anthropic', 'openai', 'google', 'deepseek'];
export const invalid = message => Object.assign(new Error(message), { status: 400 });

export function serviceAddress(value) {
  if (value === '' || value === undefined) return '';
  if (typeof value !== 'string' || value.length > 2000) throw invalid('服务地址格式不正确。');
  let url;
  try { url = new URL(value.trim()); } catch { throw invalid('请填写有效的 HTTP(S) 服务地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid('服务地址不能包含账号、查询参数或片段。');
  if (/\/(chat\/completions|responses|models)\/?$/.test(url.pathname)) throw invalid('请填写基础地址，例如 https://example.com/v1，不要包含 /chat/completions 或 /models。');
  return url.toString().replace(/\/+$/, '');
}

export function modelId(value, required = true) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) throw invalid('模型名称不能为空，且不能超过 200 个字符。');
  return value.trim();
}

export function profileFields(input, { allowEmpty = false } = {}) {
  if (!providers.includes(input.provider)) throw invalid('请选择有效的服务商。');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw invalid('配置名称不能为空，且不能超过 80 个字符。');
  const baseUrl = serviceAddress(input.baseUrl);
  if (input.provider === 'custom' && !baseUrl && !allowEmpty) throw invalid('自定义服务需要填写基础地址。');
  const model = modelId(input.model ?? '', !allowEmpty);
  const models = input.models ?? (model ? [model] : []);
  if (!Array.isArray(models) || models.length > 500) throw invalid('每个配置最多保存 500 个模型。');
  const choices = [...new Set([...models.map(value => modelId(value)), ...(model ? [model] : [])])];
  if (choices.length > 500) throw invalid('每个配置最多保存 500 个模型。');
  return { name: input.name.trim(), provider: input.provider, baseUrl, model, models: input.provider === 'custom' ? choices : [] };
}

export function sameService(a, b) { return a.provider === b.provider && a.baseUrl === b.baseUrl; }

export class ModelSettingsStore {
  constructor() {
    this.directory = process.env.CO_MATH_CONFIG_HOME || join(homedir(), '.config', 'co-math');
    this.path = join(this.directory, 'web-settings.json');
  }

  async read() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink()) throw invalid('模型设置目录不能是符号链接。');
    let stored;
    try {
      const info = await lstat(this.path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2_000_000) throw invalid('模型设置文件无法读取。');
      stored = JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stored && Object.hasOwn(stored, 'profiles')) {
      if (!Array.isArray(stored.profiles) || stored.profiles.length > 20) throw invalid('模型配置列表格式错误，原文件已保留。');
      const profiles = stored.profiles.map(profile => {
        if (!profile || typeof profile.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(profile.id)) throw invalid('模型配置编号无效。');
        return { id: profile.id, ...profileFields(profile, { allowEmpty: true }) };
      });
      if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw invalid('模型配置编号重复。');
      const first = profiles.find(profile => profile.id === 'default');
      const next = { profiles, activeProfileId: profiles.some(profile => profile.id === stored.activeProfileId) ? stored.activeProfileId : profiles[0]?.id || '' };
      if (first && !first.baseUrl && !first.model && process.env.LLM_BASE_URL) {
        Object.assign(first, profileFields({ ...first, provider: 'custom', baseUrl: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL_ID || '' }, { allowEmpty: true }));
        await this.write(next);
      }
      return next;
    }
    const legacy = process.env.LLM_BASE_URL
      ? { provider: 'custom', baseUrl: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL_ID || '' }
      : stored || { provider: 'custom', baseUrl: '', model: process.env.LLM_MODEL_ID || '' };
    const initial = { activeProfileId: 'default', profiles: [{ id: 'default', ...profileFields({ name: '默认模型服务', provider: legacy.provider || 'custom', baseUrl: legacy.baseUrl || '', model: legacy.model || '' }, { allowEmpty: true }) }] };
    await this.write(initial);
    return initial;
  }

  async write(value) {
    const content = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(content) > 2_000_000) throw invalid('模型配置过大，请减少保存的模型数量。');
    const temporary = join(this.directory, `.settings-${randomUUID()}.tmp`);
    try {
      try {
        const info = await lstat(this.path);
        if (!info.isFile() || info.isSymbolicLink()) throw invalid('模型设置必须是普通文件。');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.path);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
}

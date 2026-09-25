import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Download, Plus, Server, Trash2 } from 'lucide-react';
import { api, type ModelOption, type ModelProfile, type ModelSettings } from '../api';
import { Modal } from './Dialogs';

const ecnuAddress = 'https://chat.ecnu.edu.cn/open/api/v1';
const names: Record<string, string> = { ecnu: '华师大 ECNU', openai: 'OpenAI', anthropic: 'Claude', google: 'Google Gemini', deepseek: 'DeepSeek', custom: '其他服务' };
type Draft = { id?: string; name: string; service: string; provider: string; baseUrl: string; model: string; modelsText: string; apiKey: string; clearKey: boolean };
function draftOf(profile?: ModelProfile, template?: ModelProfile): Draft {
  const source = profile || template;
  const service = source?.provider === 'custom' && source.baseUrl.replace(/\/+$/, '') === ecnuAddress ? 'ecnu' : source?.provider || 'ecnu';
  return { id: profile?.id, name: profile?.name || '', service, provider: source?.provider || 'custom', baseUrl: source ? source.baseUrl : ecnuAddress,
    model: source?.model || (service === 'ecnu' ? 'ecnu-max' : ''), modelsText: source?.models.join('\n') || (service === 'ecnu' ? 'ecnu-max\necnu-plus' : ''), apiKey: '', clearKey: false };
}

export function SettingsDialog({ settings, onClose, onChanged }: { settings: ModelSettings; onClose: () => void; onChanged: (value: ModelSettings) => void }) {
  const active = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];
  const [form, setForm] = useState(() => draftOf(active));
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false); const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false); const [discard, setDiscard] = useState<string | null>(null); const [confirmDelete, setConfirmDelete] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  const saved = settings.profiles.find(p => p.id === form.id);
  const sameEndpoint = saved?.provider === form.provider && saved?.baseUrl.replace(/\/+$/, '') === form.baseUrl.trim().replace(/\/+$/, '');
  const hasSavedKey = saved?.configured && sameEndpoint && !form.clearKey;
  const customModels = [...new Set(form.modelsText.split('\n').map(s => s.trim()).filter(Boolean))];
  const choices = form.provider === 'custom' ? customModels.map(id => ({ id, name: id })) : options;
  const visibleChoices = form.model && !choices.some(item => item.id === form.model) ? [{ id: form.model, name: form.model }, ...choices] : choices;

  useEffect(() => {
    setOptions([]);
    if (form.provider === 'custom') return;
    const controller = new AbortController();
    api<{ models: ModelOption[] }>('/settings/models', { method: 'POST', body: { provider: form.provider, model: '', models: [] }, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setOptions(value.models); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [form.provider]);
  useEffect(() => () => lookup.current?.abort(), []);

  function edit(patch: Partial<Draft>) {
    lookup.current?.abort(); setLoadingModels(false);
    setForm(old => ({ ...old, ...patch })); setDirty(true); setNotice(''); setError(''); setConfirmDelete(false);
  }
  function chooseService(service: string) {
    edit({ service, provider: service === 'ecnu' ? 'custom' : service, name: '', baseUrl: service === 'ecnu' ? ecnuAddress : '',
      model: service === 'ecnu' ? 'ecnu-max' : '', modelsText: service === 'ecnu' ? 'ecnu-max\necnu-plus' : '', apiKey: '', clearKey: false });
  }
  function pick(id: string) {
    lookup.current?.abort(); setLoadingModels(false); setDiscard(null);
    if (id === '__close__') { onClose(); return; }
    setForm(draftOf(settings.profiles.find(p => p.id === id), active));
    setDirty(false); setError(''); setNotice(''); setConfirmDelete(false);
  }
  function requestPick(id: string) {
    if (busy) return;
    if (dirty) setDiscard(id); else pick(id);
  }
  function suggestedName() {
    const base = names[form.service] || '模型服务';
    const used = new Set(settings.profiles.filter(p => p.id !== form.id).map(p => p.name));
    if (!used.has(base)) return base;
    let number = 2;
    while (used.has(`${base}（${number}）`)) number++;
    return `${base}（${number}）`;
  }
  function payload() {
    return { id: form.id, name: form.name.trim() || suggestedName(), provider: form.provider, baseUrl: form.baseUrl, model: form.model, models: customModels, apiKey: form.apiKey, clearKey: form.clearKey };
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); lookup.current?.abort(); setLoadingModels(false);
    try {
      const value = await api<ModelSettings>('/settings', { method: 'PUT', body: { ...payload(), activate: true } });
      onChanged(value); setForm(draftOf(value.profiles.find(p => p.id === value.savedProfileId))); setDirty(false); onClose();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function fetchModels() {
    lookup.current?.abort(); const controller = new AbortController(); lookup.current = controller;
    setLoadingModels(true); setError(''); setNotice('');
    try {
      const value = await api<{ models: ModelOption[]; excludedCount?: number }>('/settings/models', { method: 'POST', body: payload(), signal: controller.signal });
      if (controller.signal.aborted) return;
      const ids = [...new Set([...customModels, ...value.models.map(m => m.id)])];
      setForm(old => ({ ...old, modelsText: ids.join('\n'), model: old.model || value.models[0]?.id || '' }));
      setDirty(true); setNotice(`已找到 ${value.models.length} 个可选模型。${value.excludedCount ? '已略过向量、图片和语音等非对话模型。' : ''}`);
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
    finally { if (!controller.signal.aborted) setLoadingModels(false); }
  }
  async function remove() {
    if (!form.id) return;
    setBusy(true); setError(''); lookup.current?.abort(); setLoadingModels(false);
    try {
      const value = await api<ModelSettings>(`/settings/profiles/${form.id}`, { method: 'DELETE', body: {} });
      onChanged(value); setForm(draftOf(value.profiles.find(p => p.id === value.activeProfileId) || value.profiles[0]));
      setDirty(false); setConfirmDelete(false); setDiscard(null); setNotice('服务已移除。');
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }

  return <Modal title="模型服务" className="settings-dialog" onClose={() => requestPick('__close__')}>
    <p className="settings-intro">选好服务，填入密钥，就可以开始研究。</p>
    {discard !== null && <div className="discard-notice" role="alert"><span>有未保存的修改。</span><button type="button" onClick={() => setDiscard(null)}>继续编辑</button><button type="button" onClick={() => pick(discard)}>放弃修改{discard === '__close__' ? '并关闭' : '并切换'}</button></div>}
    <div className="settings-layout">
      <aside className="profile-sidebar"><div className="profile-list-title">已添加的服务</div>
        {settings.profiles.map(profile => <button type="button" key={profile.id} disabled={busy} className={'profile-card ' + (profile.id === form.id ? 'selected' : '')} onClick={() => requestPick(profile.id)}>
          <Server size={17}/><span><strong>{profile.name}</strong><small>{profile.model || '尚未选择模型'}</small></span>{profile.id === settings.activeProfileId && <Check size={15} aria-label="当前使用"/>}
        </button>)}
        <button type="button" className="add-profile" disabled={busy || settings.profiles.length >= 20} onClick={() => requestPick('')}><Plus size={16}/>添加服务</button>
      </aside>
      <form className="profile-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>选择服务<select value={form.service} onChange={e => chooseService(e.target.value)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {form.service === 'custom' && <label>服务地址<input type="url" required value={form.baseUrl} onChange={e => edit({ baseUrl: e.target.value })} placeholder="粘贴服务商提供的 API 地址"/></label>}
          <label>API 密钥<input type="password" autoComplete="off" required={!hasSavedKey && !form.clearKey} value={form.apiKey} maxLength={10000} onChange={e => edit({ apiKey: e.target.value, clearKey: false })} placeholder={hasSavedKey ? '已填写，留空继续使用' : '粘贴你的 API Key'}/></label>
          <div className="model-list-heading"><label htmlFor="profile-model">选择模型</label>{form.provider === 'custom' && <button type="button" className="text-button" disabled={loadingModels || (!form.apiKey && !hasSavedKey)} onClick={() => void fetchModels()}><Download size={14}/>{loadingModels ? '正在获取…' : '获取模型'}</button>}</div>
          <select id="profile-model" required value={form.model} onChange={e => edit({ model: e.target.value })}><option value="" disabled>{visibleChoices.length ? '请选择模型' : '填写密钥后，点击“获取模型”'}</option>{visibleChoices.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select>
          <details className="advanced-settings"><summary>更多设置</summary>
            <label>显示名称 <span className="muted">不填会自动命名</span><input maxLength={80} value={form.name} onChange={e => edit({ name: e.target.value })} placeholder={suggestedName()}/></label>
            {form.provider !== 'custom' && <label>自定义服务地址 <span className="muted">通常无需填写</span><input type="url" value={form.baseUrl} onChange={e => edit({ baseUrl: e.target.value })} placeholder="留空使用官方地址"/></label>}
            {form.provider === 'custom' && <><label>手动填写当前模型<input value={form.model} maxLength={200} onChange={e => edit({ model: e.target.value })} placeholder="模型 ID"/></label><label>其他可选模型<textarea rows={3} value={form.modelsText} onChange={e => edit({ modelsText: e.target.value })} placeholder="每行填写一个模型 ID"/></label></>}
            {saved?.configured && sameEndpoint && <label className="checkbox-label"><input type="checkbox" checked={form.clearKey} onChange={e => edit({ clearKey: e.target.checked, apiKey: '' })}/>保存时清除此服务的密钥</label>}
            {form.id && <button type="button" className="delete-profile" onClick={() => setConfirmDelete(true)}><Trash2 size={14}/>移除此服务</button>}
          </details>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}{notice && <p className="settings-notice" role="status">{notice}</p>}
        {confirmDelete && <div className="discard-notice"><span>移除“{saved?.name}”？</span><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button><button type="button" disabled={busy} onClick={() => void remove()}>确认移除</button></div>}
        <footer className="simple-settings-footer"><p>密钥只在本次应用运行中保留。</p><button className="primary" disabled={busy} type="submit">{busy ? '正在保存…' : '保存并使用'}</button></footer>
      </form>
    </div>
  </Modal>;
}

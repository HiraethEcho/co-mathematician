import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { X, FolderOpen, Plus, KeyRound } from 'lucide-react';
import { api, type ModelSettings, type Project } from '../api';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20}/></button></header>{children}
  </dialog>;
}

export function ProjectDialog({ onClose, onCreated, home }: { onClose: () => void; onCreated: (project: Project) => void; home: string }) {
  const [mode, setMode] = useState<'new' | 'open'>('new');
  const [name, setName] = useState(''); const [question, setQuestion] = useState('');
  const [path, setPath] = useState(''); const [language, setLanguage] = useState('中文');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onCreated(await api<Project>(mode === 'new' ? '/projects' : '/projects/open', { method: 'POST', body: mode === 'new' ? { name, question, language } : { path } })); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <Modal title="开启一段研究" onClose={onClose}><form onSubmit={submit}>
    <div className="segmented"><button type="button" className={mode === 'new' ? 'selected' : ''} onClick={() => setMode('new')}><Plus size={16}/>新建项目</button><button type="button" className={mode === 'open' ? 'selected' : ''} onClick={() => setMode('open')}><FolderOpen size={16}/>打开已有项目</button></div>
    {mode === 'new' ? <><label>项目名称<input autoFocus required value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="例如：梯度下降的收敛性"/></label>
      <label>想研究的问题 <span className="muted">可稍后补充</span><textarea value={question} maxLength={20000} onChange={e => setQuestion(e.target.value)} rows={4} placeholder="写下问题、已知条件，或目前卡住的地方…"/></label>
      <label>研究材料语言<select value={language} onChange={e => setLanguage(e.target.value)}><option>中文</option><option>English</option></select></label>
      <p className="form-help">项目将保存在 <span className="path">{home}</span>，也可使用原来的 co-math 命令继续。</p></> : <><label>Co-Math 项目完整路径<input autoFocus value={path} required onChange={e => setPath(e.target.value)} placeholder="包含 co-math.toml 的文件夹"/></label><p className="form-help">读取原有研究材料；网页对话单独保存在项目的 .co-math 目录。</p></>}
    {error && <p role="alert" className="error">{error}</p>}
    <footer className="dialog-footer"><button type="button" className="secondary" onClick={onClose}>取消</button><button disabled={busy} className="primary">{busy ? '正在打开…' : mode === 'new' ? '创建项目' : '打开项目'}</button></footer>
  </form></Modal>;
}

export function SettingsDialog({ settings, onClose, onSaved }: { settings: ModelSettings; onClose: () => void; onSaved: (settings: ModelSettings) => void }) {
  const [provider, setProvider] = useState(settings.provider); const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl); const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const updated = await api<ModelSettings>('/settings', { method: 'PUT', body: { provider, model, baseUrl, apiKey } }); setApiKey(''); onSaved(updated); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <Modal title="模型设置" onClose={onClose}><form onSubmit={submit}>
    <p className="form-help">连接你选择的模型服务。保存设置后，通过一次实际研究对话确认服务是否可用。</p>
    <label>模型服务<select value={provider} onChange={e => { setProvider(e.target.value); setModel(''); setApiKey(''); }}>{settings.providers.map(p => <option key={p} value={p}>{p === 'custom' ? '自定义 OpenAI 兼容服务' : p}</option>)}</select></label>
    {provider === 'custom' && <label>服务地址<input required type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://example.com/v1"/></label>}
    <label>模型名称<input required list="models" value={model} onChange={e => setModel(e.target.value)} placeholder="填写服务商提供的模型 ID"/><datalist id="models">{settings.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist></label>
    <label>API Key<input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={settings.configured && provider === settings.provider ? '已在内存中配置，留空保留' : '填写密钥，仅本次运行有效'}/></label>
    <div className="info-box"><KeyRound size={17}/><span>密钥仅保存在服务内存中，重启后需重新填写。项目材料会发送给所选模型服务。</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="dialog-footer"><button type="button" className="secondary" onClick={onClose}>取消</button><button disabled={busy} className="primary">{busy ? '保存中…' : '保存设置'}</button></footer>
  </form></Modal>;
}

export function NoteDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (title: string, content: string) => Promise<void> }) {
  const [title, setTitle] = useState('研究笔记'); const [content, setContent] = useState(initial);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await onSave(title, content); } catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <Modal title="保存研究笔记" onClose={onClose}><form onSubmit={submit}>
    <label>标题<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} maxLength={200}/></label>
    <label>Markdown 内容<textarea className="note-editor" required value={content} onChange={e => setContent(e.target.value)} rows={12} maxLength={200000}/></label>
    <p className="form-help">保存为项目 notes 目录中的新文件，保留原有研究材料。</p>
    {error && <p role="alert" className="error">{error}</p>}
    <footer className="dialog-footer"><button type="button" className="secondary" onClick={onClose}>取消</button><button disabled={busy} className="primary">{busy ? '正在保存…' : '保存笔记'}</button></footer>
  </form></Modal>;
}

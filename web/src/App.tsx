import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronRight, FileText, FolderOpen, Plus, Settings, RefreshCw, PanelLeftClose, NotebookPen, X, ArrowUpRight, Check } from 'lucide-react';
import { api, mergeMessages, type Document, type Message, type ModelSettings, type Project, type ProjectFile } from './api';
import { Markdown } from './components/Markdown';
import { ProjectDialog, NoteDialog } from './components/Dialogs';
import { SettingsDialog } from './components/SettingsDialog';
import { Chat } from './components/Chat';
import verymathLogo from './assets/verymath-logo.png?inline';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]); const [home, setHome] = useState('');
  const [projectId, setProjectId] = useState(() => localStorage.getItem('co-math-project') || '');
  const [files, setFiles] = useState<ProjectFile[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [document, setDocument] = useState<Document | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<ModelSettings | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'project' | 'settings' | 'note' | null>(null); const [note, setNote] = useState('');
  const [sending, setSending] = useState(false); const [connected, setConnected] = useState(false); const [loading, setLoading] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [sidebar, setSidebar] = useState(() => window.innerWidth >= 960); const [mobilePane, setMobilePane] = useState('document');
  const currentProject = useRef(projectId); currentProject.current = projectId;
  const documentRequest = useRef(0);
  const project = projects.find(p => p.id === projectId);
  const busy = messages.some(m => m.status === 'running');
  async function reloadProjects() {
    const result = await api<{ projects: Project[]; home: string; errors: { name: string; error: string }[] }>('/projects');
    setProjects(result.projects); setHome(result.home);
    if (result.errors.length) setError(result.errors.map(e => `${e.name}：${e.error}`).join('\n'));
  }
  useEffect(() => { void Promise.all([reloadProjects(), api<ModelSettings>('/settings').then(setSettings)]).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    localStorage.setItem('co-math-project', projectId);
    setFiles([]); setSelected([]); setMessages([]); setDocument(null); setError(''); setNotice('');
    documentRequest.current++; setConnected(false);
    if (!projectId) return;
    const controller = new AbortController(); const options = { signal: controller.signal };
    const prefix = `/projects/${projectId}`;
    setLoading(true);
    Promise.all([api<{ files: ProjectFile[]; truncated: boolean }>(prefix + '/files', options), api<{ messages: Message[] }>(prefix + '/chat', options)]).then(([data, conversation]) => {
      if (controller.signal.aborted) return;
      setFiles(data.files); setMessages(old => mergeMessages(old, conversation.messages));
      if (data.truncated) setNotice('项目材料较多，当前显示前 1,500 个文件。');
      const initial = data.files.find(f => f.path.endsWith('/project/PROJECT.md')) || data.files[0];
      if (initial) void openFile(initial.path, projectId);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const events = new EventSource('/api' + prefix + '/events');
    events.onopen = () => {
      if (controller.signal.aborted) return;
      setConnected(true);
      void api<{ messages: Message[] }>(prefix + '/chat', options).then(data => { if (!controller.signal.aborted) setMessages(old => mergeMessages(old, data.messages)); }).catch(() => {});
    };
    events.onmessage = event => { if (!controller.signal.aborted) { const message: Message = JSON.parse(event.data); setMessages(old => mergeMessages(old, [message])); } };
    events.onerror = () => { if (!controller.signal.aborted) setConnected(false); };
    return () => { controller.abort(); events.close(); };
  }, [projectId]);
  async function openFile(path: string, id = projectId) {
    const request = ++documentRequest.current;
    try { const data = await api<Document>(`/projects/${id}/file?path=${encodeURIComponent(path)}`); if (request === documentRequest.current && currentProject.current === id) { setDocument(data); setMobilePane('document'); } }
    catch (e) { if (request === documentRequest.current) setError((e as Error).message); }
  }
  async function send(content: string) {
    setSending(true); setError(''); const id = projectId;
    try {
      await api(`/projects/${id}/runs`, { method: 'POST', body: { content, files: selected, profileId: settings?.activeProfileId, model: settings?.model, provider: settings?.provider, baseUrl: settings?.baseUrl } });
      const conversation = await api<{ messages: Message[] }>(`/projects/${id}/chat`);
      if (currentProject.current === id) setMessages(old => mergeMessages(old, conversation.messages));
    } catch (e) { setError((e as Error).message); void api<ModelSettings>('/settings').then(setSettings).catch(() => {}); throw e; } finally { setSending(false); }
  }
  async function selectModel(profileId: string, model?: string) {
    if (switchingModel) return;
    setSwitchingModel(true); setError('');
    try {
      const value = await api<ModelSettings>('/settings/select', { method: 'POST', body: { profileId, model } });
      setSettings(value); setNotice(`后续提问使用：${value.profileName} / ${value.model || '尚未选择模型'}`);
    } catch (error) { setError((error as Error).message); }
    finally { setSwitchingModel(false); }
  }
  async function saveNote(title: string, content: string) {
    const id = projectId;
    const saved = await api<Document>(`/projects/${id}/notes`, { method: 'POST', body: { title, content } });
    if (currentProject.current !== id) return;
    setDocument(saved); setDialog(null); setNotice('研究笔记已保存到项目。');
    const data = await api<{ files: ProjectFile[] }>(`/projects/${id}/files`);
    if (currentProject.current === id) setFiles(data.files);
  }
  async function refreshFiles() {
    const id = projectId;
    try {
      const data = await api<{ files: ProjectFile[] }>(`/projects/${id}/files`);
      if (currentProject.current !== id) return;
      setFiles(data.files);
      if (document) void openFile(document.path, id);
    } catch (error) { if (currentProject.current === id) setError((error as Error).message); }
  }
  return <div className={'app ' + (sidebar ? '' : 'sidebar-hidden')}>
    <nav className="sidebar">
      <a className="brand" href="#" aria-label="VeryMath Co-Math 首页" onClick={e => { e.preventDefault(); setProjectId(''); }}><img className="brand-logo" src={verymathLogo} alt="VeryMath" width={960} height={286}/><span className="brand-caption">Co-Math · 研究工作台</span></a>
      <button className="new-project" onClick={() => setDialog('project')}><Plus size={17}/>新建 / 打开项目</button>
      <div className="sidebar-label">我的研究 <span>{projects.length.toString().padStart(2, '0')}</span></div>
      <div className="project-list">{projects.map(p => <button title={p.path} className={'project-item ' + (p.id === projectId ? 'active' : '')} key={p.id} onClick={() => setProjectId(p.id)}><FolderOpen size={16}/><span>{p.name}</span>{p.id === projectId && <span className="active-pin"/>}</button>)}{!projects.length && <p className="sidebar-hint">每个问题，都有自己的研究空间。</p>}</div>
      {project && <><div className="sidebar-label materials-label">项目材料<button aria-label="刷新材料" onClick={() => void refreshFiles()}><RefreshCw size={13}/></button></div><div className="file-list">{files.map(file => <button title={file.path} className={'file-item ' + (document?.path === file.path ? 'active' : '')} key={file.path} onClick={() => void openFile(file.path)}><FileText size={14}/><span>{file.title || file.path.split('/').at(-1)}</span>{selected.includes(file.path) && <Check size={12}/>}</button>)}</div></>}
      <div className="sidebar-bottom"><span className="local-dot"/><span>本机保存 · 持续研究</span><button aria-label="模型设置" onClick={() => setDialog('settings')}><Settings size={16}/></button></div>
    </nav>
    <main className={'workbench show-' + mobilePane}>
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button" aria-label={sidebar ? '收起侧栏' : '展开侧栏'} onClick={() => setSidebar(!sidebar)}><PanelLeftClose size={18}/></button><span>研究空间</span><ChevronRight size={14}/><strong>{project?.name || '欢迎回来'}</strong></div><div className="topbar-right"><span className="local-badge"><span className="local-dot"/>LOCAL</span><button className="icon-button" onClick={() => setDialog('settings')} aria-label="打开设置"><Settings size={18}/></button></div></header>
      {error && <div className="banner error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><X size={15}/></button></div>}
      {notice && <div className="banner notice" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={15}/></button></div>}
      {!project ? <section className="welcome"><div className="welcome-content"><span className="eyebrow">A PLACE FOR MATHEMATICAL THOUGHT</span><h1>让问题，<br/>一步步变得清楚。</h1><p>把想法、推导与未解决的问题留在同一个地方。<br/>与模型讨论，回到材料，继续你的研究。</p><button className="primary welcome-button" onClick={() => setDialog('project')}><Plus size={18}/>开启研究空间<ArrowUpRight size={18}/></button><div className="welcome-features"><div><BookOpen size={20}/><strong>读懂材料</strong><span>从项目文档出发</span></div><div><NotebookPen size={20}/><strong>留下思考</strong><span>笔记属于你的项目</span></div><div><RefreshCw size={20}/><strong>随时继续</strong><span>重新打开，接着研究</span></div></div></div><div className="math-decoration" aria-hidden="true"><span>∇f(x)</span><i>思考 · 推导 · 再检视</i><div>f(x) − f(x*) ≤ ε</div></div></section> : <><div className="mobile-tabs"><button className={mobilePane === 'document' ? 'active' : ''} onClick={() => setMobilePane('document')}>研究材料</button><button className={mobilePane === 'chat' ? 'active' : ''} onClick={() => setMobilePane('chat')}>模型对话</button></div><div className="workspace-columns"><section className="document-pane">
        <div className="document-toolbar"><div><FileText size={16}/><span>{document?.path.split('/').at(-1) || '项目材料'}</span></div><button className="text-button" onClick={() => { setNote(''); setDialog('note'); }}><Plus size={15}/>写笔记</button></div>
        <div className="document-scroll">{document ? <><div className="document-heading"><span className="eyebrow">RESEARCH MATERIAL</span><button className={'attach-button ' + (selected.includes(document.path) ? 'attached' : '')} disabled={!selected.includes(document.path) && selected.length >= 6} onClick={() => setSelected(old => old.includes(document.path) ? old.filter(p => p !== document.path) : [...old, document.path])}>{selected.includes(document.path) ? <Check size={14}/> : <Plus size={14}/>} {selected.includes(document.path) ? '已加入对话' : '结合此文档提问'}</button></div>{/\.(md|txt)$/i.test(document.path) ? <Markdown>{document.content}</Markdown> : <pre className="source-document">{document.content}</pre>}<footer className="document-end"><span>来自项目文件</span><code>{document.path}</code></footer></> : <div className="document-empty"><BookOpen size={28}/><h3>{loading ? '正在读取项目…' : '选择一份材料'}</h3><p>左侧列出了项目中的研究文档。</p></div>}</div>
      </section><Chat key={projectId} messages={messages} settings={settings} files={selected} busy={busy} sending={sending || switchingModel} switchingModel={switchingModel} onSelectModel={selectModel} connected={connected} onSend={send} onStop={() => { void api(`/projects/${projectId}/cancel`, { method: 'POST', body: {} }).catch(e => setError(e.message)); }} onSave={content => { setNote(content); setDialog('note'); }} onRemoveFile={path => setSelected(old => old.filter(p => p !== path))} onSettings={() => setDialog('settings')}/></div></>}
    </main>
    {dialog === 'project' && <ProjectDialog home={home} onClose={() => setDialog(null)} onCreated={p => { setProjects(old => [...old.filter(item => item.id !== p.id), p]); setProjectId(p.id); setDialog(null); }}/ >}
    {dialog === 'settings' && settings && <SettingsDialog settings={settings} onClose={() => setDialog(null)} onChanged={setSettings}/ >}
    {dialog === 'note' && project && <NoteDialog initial={note} onClose={() => setDialog(null)} onSave={saveNote}/ >}
  </div>;
}

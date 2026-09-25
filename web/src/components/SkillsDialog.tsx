import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, RefreshCw } from 'lucide-react';
import { api, type Skill, type SkillCatalog, type SkillDetail } from '../api';
import { skillTitle, skillSummary } from '../skill-labels';
import { Modal } from './Dialogs';

export function SkillsDialog({ projectId, onClose, onUse, onLibraryChanged }: { projectId: string; onClose: () => void; onUse: (skill: Skill) => void; onLibraryChanged: () => void }) {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null); const [directory, setDirectory] = useState('');
  const [query, setQuery] = useState(''); const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [connecting, setConnecting] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<SkillCatalog>(`/projects/${projectId}/skills`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setCatalog(value); setDirectory(value.directory); } }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [projectId]);
  async function refresh() {
    setError('');
    try { const value = await api<SkillCatalog>(`/projects/${projectId}/skills`); setCatalog(value); setDirectory(value.directory); }
    catch (error) { setError((error as Error).message); }
  }
  async function connect() {
    setConnecting(true); setError(''); request.current?.abort(); setDetail(null); setLoading(false);
    try { const value = await api<{directory: string}>('/skills/library', { method: 'POST', body: { directory } }); if (value.directory !== catalog?.directory) onLibraryChanged(); await refresh(); }
    catch (error) { setError((error as Error).message); }
    finally { setConnecting(false); }
  }
  async function inspect(skill: Skill) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setDetail(null); setLoading(true); setError('');
    try {
      const value = await api<SkillDetail>(`/projects/${projectId}/skill?source=${skill.source}&path=${encodeURIComponent(skill.path)}`, { signal: controller.signal });
      if (!controller.signal.aborted) setDetail(value);
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const choices = catalog?.skills.filter(skill => `${skillTitle(skill)} ${skill.name} ${skill.description} ${skill.group}`.toLowerCase().includes(query.toLowerCase().trim())) || [];
  return <Modal title="VeryMath Skill" className="skills-dialog" onClose={onClose}>
    <p className="settings-intro">选择一种研究方法，把对应步骤和参考说明带入对话。</p>
    <details className="skill-library" open={catalog ? !catalog.directory : false}><summary>{catalog?.directory ? 'Skill 库已接入' : '接入 VeryMath Skill 库'}</summary>
      <div><input aria-label="Skill 库目录" value={directory} onChange={event => setDirectory(event.target.value)} placeholder="本机 VeryMath Skill 库所在文件夹"/><button className="secondary" disabled={connecting} onClick={() => void connect()}>{connecting ? '接入中…' : directory.trim() ? '接入目录' : '断开目录'}</button></div>
      <p>使用标准 SKILL.md，支持分组目录。读取原有文件，无需改造 Skill 包。</p>
    </details>
    <div className="skill-search"><Search size={16}/><input aria-label="搜索 Skill" placeholder="搜索：证明、论文、优化…" value={query} onChange={event => setQuery(event.target.value)}/><button aria-label="刷新 Skill 列表" onClick={() => void refresh()}><RefreshCw size={15}/></button></div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="skill-browser"><div className="skill-choices">{choices.map(skill => <button key={`${skill.source}:${skill.path}`} className={'skill-choice ' + (detail?.source === skill.source && detail.path === skill.path ? 'selected' : '')} onClick={() => void inspect(skill)}>
      <BookOpen size={16}/><span><strong>{skillTitle(skill)}</strong><small>{skill.source === 'verymath' ? 'VeryMath' : '项目'} · {skill.name}</small></span>
    </button>)}{!choices.length && <p className="muted">{catalog ? '没有匹配的 Skill。可以换个关键词，或接入 Skill 库。' : '正在读取 Skill…'}</p>}</div>
      <div className="skill-detail">{loading ? <p className="muted">正在读取说明与参考资料…</p> : detail ? <>
        <h3>{skillTitle(detail)}</h3><p className="skill-description">{skillSummary(detail)}</p>
        <p className="skill-mode">当前用于流程指导。需要终端、Lean 或求解器的步骤，需另接执行器。</p>
        <details><summary>查看说明与参考文件（{detail.resources.length}）</summary><pre>{detail.instructions}</pre>{detail.resources.map(resource => <details key={resource.path}><summary>{resource.path}</summary><pre>{resource.content}</pre></details>)}</details>
        {!!detail.warnings.length && <p className="error">{detail.warnings.join('\n')}</p>}
        <button className="primary" onClick={() => onUse({ source: detail.source, path: detail.path, directory: detail.directory, name: detail.name, title: detail.title, description: detail.description, mode: 'guidance' })}>使用这个 Skill</button>
      </> : <div className="skill-detail-empty"><BookOpen size={25}/><p>选择一个 Skill 查看说明</p></div>}</div>
    </div>
    {!!catalog?.warnings.length && <details className="skill-read-warnings"><summary>部分文件未读取</summary><p>{catalog.warnings.join('\n')}</p></details>}
  </Modal>;
}

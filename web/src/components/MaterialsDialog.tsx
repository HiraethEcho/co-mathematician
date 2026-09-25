import { useRef, useState, type DragEvent } from 'react';
import { Check, FileText, Upload, X } from 'lucide-react';
import { api, type ImportedMaterial } from '../api';
import { Modal } from './Dialogs';

const suffixes = ['pdf', 'docx', 'md', 'txt', 'tex', 'csv', 'json', 'yaml', 'yml', 'py', 'lean', 'bib'];
type Item = { file: File; status: 'waiting' | 'uploading' | 'done' | 'error'; result?: ImportedMaterial; error?: string };

function encodeFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('文件读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}

export function MaterialsDialog({ projectId, projectName, initialFiles, onClose, onAdded }: {
  projectId: string; projectName: string; initialFiles: File[]; onClose: () => void;
  onAdded: (projectId: string, materials: ImportedMaterial[]) => Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>(() => initialFiles.slice(0, 10).map(file => ({ file, status: 'waiting' })));
  const [error, setError] = useState(initialFiles.length > 10 ? '一次最多添加 10 个文件，其余文件请分批添加。' : '');
  const [busy, setBusy] = useState(false); const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(files: File[]) {
    if (busy) return;
    if (files.length + items.length > 10) { setError('一次最多添加 10 个文件，请分批添加。'); return; }
    setItems(old => [...old, ...files.map(file => ({ file, status: 'waiting' as const }))]); setError('');
  }
  function drop(event: DragEvent) {
    event.preventDefault(); event.stopPropagation(); setDragging(false); choose([...event.dataTransfer.files]);
  }
  async function upload() {
    if (busy) return;
    setBusy(true); setError('');
    const added: ImportedMaterial[] = [];
    for (const item of items.filter(item => item.status !== 'done')) {
      const change = (patch: Partial<Item>) => setItems(old => old.map(value => value === item || value.file === item.file ? { ...value, ...patch } : value));
      try {
        const extension = item.file.name.split('.').at(-1)?.toLowerCase() || '';
        if (!suffixes.includes(extension)) throw new Error('暂不支持这个格式，请使用 PDF、.docx 或文本文件。');
        if (!item.file.size || item.file.size > 10 * 1024 * 1024) throw new Error('请选择非空文件，单个文件不超过 10 MB。');
        change({ status: 'uploading', error: '' });
        const data = await encodeFile(item.file);
        const result = await api<ImportedMaterial>(`/projects/${projectId}/materials`, { method: 'POST', body: { name: item.file.name, data } });
        added.push(result); change({ status: 'done', result });
      } catch (error) {
        change({ status: 'error', error: error instanceof TypeError ? '连接中断，请刷新项目材料确认是否已保存，再决定重试。' : (error as Error).message });
      }
    }
    if (added.length) {
      try { await onAdded(projectId, added); }
      catch { setError('文件已添加，但列表刷新失败；关闭窗口后可点击“刷新材料”。'); }
    }
    setBusy(false);
  }
  const pending = items.filter(item => item.status !== 'done').length;
  const done = items.filter(item => item.status === 'done').length;
  return <Modal title="添加材料" onClose={() => { if (!busy) onClose(); }}>
    <p className="materials-intro">添加到 <strong>{projectName}</strong></p>
    <div className={'material-dropzone ' + (dragging ? 'dragging' : '')} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <Upload size={26}/><strong>把文件拖到这里</strong><span>或从电脑中选择资料</span>
      <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>选择文件</button>
      <input ref={input} type="file" hidden multiple accept={suffixes.map(suffix => '.' + suffix).join(',')} onChange={event => { choose([...event.target.files || []]); event.target.value = ''; }}/>
    </div>
    <p className="field-help material-types">PDF、Word、Markdown、文本、LaTeX、CSV 和代码<br/>单个不超过 10 MB，一次最多 10 个。重名文件会自动另存。</p>
    {!!items.length && <ul className="material-queue">{items.map((item, index) => <li key={index}>
      {item.status === 'done' ? <Check className="material-saved" size={16}/> : <FileText size={16}/>}
      <div><strong>{item.file.name}</strong><span>{item.status === 'uploading' ? '正在添加…' : item.status === 'done' ? `已保存${item.result?.name !== item.file.name ? '为 ' + item.result?.name : ''}` : item.error || `${(item.file.size / 1024).toFixed(0)} KB`}</span></div>
      {!busy && item.status !== 'done' && <button aria-label={`移除选择 ${item.file.name}`} onClick={() => setItems(old => old.filter((_, position) => position !== index))}><X size={14}/></button>}
    </li>)}</ul>}
    {error && <p role="alert" className="error">{error}</p>}
    {!!done && <p role="status" className="material-success">已添加 {done} 份材料。关闭后可阅读，并选择用于对话。</p>}
    <footer className="dialog-footer"><button className="secondary" disabled={busy} onClick={onClose}>{done ? '完成' : '取消'}</button>{!!pending && <button className="primary" disabled={busy} onClick={() => void upload()}>{busy ? '正在添加…' : `添加 ${pending} 个文件`}</button>}</footer>
  </Modal>;
}

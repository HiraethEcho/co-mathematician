import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, BookmarkPlus, Copy, MessageCircle, X, Check } from 'lucide-react';
import type { Message, ModelSettings } from '../api';
import { Markdown } from './Markdown';

const states: Record<string, string> = { running: '正在思考与生成', succeeded: '回答已保存', failed: '请求失败', cancelled: '已停止', interrupted: '运行中断' };

export function Chat({ messages, settings, files, busy, sending, connected, onSend, onStop, onSave, onRemoveFile, onSettings }: {
  messages: Message[]; settings: ModelSettings | null; files: string[]; busy: boolean; sending: boolean; connected: boolean;
  onSend: (content: string) => Promise<void>; onStop: () => void; onSave: (content: string) => void; onRemoveFile: (path: string) => void; onSettings: () => void;
}) {
  const [input, setInput] = useState(''); const [copied, setCopied] = useState('');
  const scroll = useRef<HTMLDivElement>(null); const follow = useRef(true);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages]);
  async function submit() {
    if (!input.trim() || busy || sending) return;
    const submitted = input;
    try { await onSend(submitted); setInput(current => current === submitted ? '' : current); follow.current = true; } catch { /* Parent shows the error. */ }
  }
  return <aside className="chat-pane">
    <header className="chat-header"><div><MessageCircle size={18}/><strong>研究对话</strong></div><span className={'connection-dot ' + (connected ? 'online' : '')} title={connected ? '已连接本地服务' : '正在连接本地服务'}/></header>
    <button className="model-selector" onClick={onSettings}><span className="model-symbol">✳</span><span>{settings?.model || '选择一个模型'}<small>{settings?.configured ? '密钥已配置' : '尚未配置模型'}</small></span><span className="muted">⌄</span></button>
    <div className="messages" ref={scroll} onScroll={() => { const e = scroll.current; if (e) follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100; }}>
      {!messages.length && <div className="chat-empty"><span className="empty-symbol">∴</span><h3>从一个问题开始</h3><p>梳理假设，推导一个结论，<br/>或一起找出证明中缺少的一步。</p><button onClick={() => setInput('请根据项目问题，梳理已知条件、研究目标和下一步需要澄清的问题。')}>帮我梳理这个问题 <ArrowUp size={14}/></button><button onClick={() => setInput('请阅读所选材料，指出关键假设、推导中尚未说明的步骤，以及值得核查的边界情况。')}>检查材料中的推导 <ArrowUp size={14}/></button></div>}
      {messages.map(message => <article className={'message ' + message.role} key={message.id}>
        <div className="message-meta"><strong>{message.role === 'user' ? '你' : 'Co-Math'}</strong><span>{message.role === 'assistant' ? states[message.status || ''] : new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        {message.content ? <Markdown>{message.content}</Markdown> : message.status === 'running' ? <div className="thinking"><i/><i/><i/></div> : null}
        {message.error && <p role="status" className="error">{message.error}</p>}
        {!!message.sources?.length && <details className="sources"><summary>使用了 {message.sources.length} 份项目材料</summary>{message.sources.map(path => <div key={path}>{path}</div>)}</details>}
        {message.role === 'assistant' && message.content && message.status !== 'running' && <div className="message-actions"><button onClick={() => onSave(`模型：${message.model || '未知'} · ${new Date(message.createdAt).toLocaleString()}\n\n状态：研究草稿，未经独立审稿或形式化验证。\n\n${message.content}`)}><BookmarkPlus size={14}/>保存为笔记</button><button aria-label="复制回答" onClick={async () => { try { await navigator.clipboard.writeText(message.content); setCopied(message.id); } catch { setCopied(''); } }}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>}</button></div>}
      </article>)}
    </div>
    <div className="composer-area">
      {!!files.length && <div className="attachments">{files.map(path => <span key={path} title={path}>{path.split('/').at(-1)}<button aria-label={`移除材料 ${path}`} onClick={() => onRemoveFile(path)}><X size={12}/></button></span>)}</div>}
      <div className="composer"><textarea aria-label="研究问题" placeholder={settings?.configured ? '提出问题，或继续这段推导…' : '先配置模型，即可围绕项目讨论…'} value={input} maxLength={20000} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}/><div className="composer-footer"><span>⌘ / Ctrl + Enter 发送</span>{busy ? <button className="stop" onClick={onStop}><Square size={12} fill="currentColor"/>停止</button> : <button className="send" aria-label="发送问题" disabled={!input.trim() || sending || !settings?.configured} onClick={() => void submit()}><ArrowUp size={19}/></button>}</div></div>
      <p className="context-note">发送项目概况、所选材料及最近对话给模型。<br/>模型回答需要核查，可保存为研究笔记。</p>
    </div>
  </aside>;
}

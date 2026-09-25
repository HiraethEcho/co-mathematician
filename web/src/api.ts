export interface Project { id: string; name: string; path: string; workspace: string; status: string; question: string; blocker: string; }
export interface ProjectFile { path: string; size: number; title?: string; }
export interface Document { path: string; content: string; }
export interface Message { id: string; order: number; role: 'user' | 'assistant'; content: string; createdAt: string; status?: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'; model?: string; profileName?: string; provider?: string; sources?: string[]; error?: string; }
export interface ModelOption { id: string; name: string; }
export interface ModelProfile { id: string; name: string; provider: string; model: string; baseUrl: string; models: string[]; configured: boolean; }
export interface ModelSettings { activeProfileId: string; profileName: string; profiles: ModelProfile[]; provider: string; model: string; baseUrl: string; configured: boolean; providers: string[]; models: ModelOption[]; savedProfileId?: string; }

export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    method: options.method || 'GET', signal: options.signal,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json', 'X-Co-Math-Request': '1' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作未完成，请重试。');
  return result as T;
}

export function mergeMessages(previous: Message[], incoming: Message[]) {
  const result = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) {
    const old = result.get(message.id);
    if (old?.status && old.status !== 'running' && message.status === 'running') continue;
    if (old?.status === 'running' && message.status === 'running' && old.content.length > message.content.length) continue;
    result.set(message.id, message);
  }
  return [...result.values()].sort((a, b) => a.order - b.order);
}

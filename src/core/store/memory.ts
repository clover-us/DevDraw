/** 内存 Store —— 测试用 + 无持久化兜底（刷新即失，明确告知用户）。 */
import { sortSessions } from '../session';
import type { ReasoningSession } from '../session';
import type { ProjectSnapshot, ModelStore } from './types';

export class MemoryStore implements ModelStore {
  readonly kind = 'memory' as const;
  readonly label = '内存（未持久化）';
  readonly autoSave = false;
  private snapshot: ProjectSnapshot | null;

  constructor(initial: ProjectSnapshot | null = null) {
    this.snapshot = initial;
  }

  async load(): Promise<ProjectSnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: ProjectSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }

  async saveSession(session: ReasoningSession): Promise<void> {
    const current = this.snapshot;
    const rest = (current?.sessions ?? []).filter((s) => s.id !== session.id);
    const sessions = sortSessions([...rest, structuredClone(session)]);
    this.snapshot = current ? { ...current, sessions } : null;
  }

  async deleteSession(id: string): Promise<void> {
    const current = this.snapshot;
    if (!current) return;
    this.snapshot = { ...current, sessions: (current.sessions ?? []).filter((s) => s.id !== id) };
  }
}
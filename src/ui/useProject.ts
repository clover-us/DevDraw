/**
 * useProject —— 持久化状态 hook：ModelStore 接线 + 脏标记 + 自动保存（FSA）/手动导出（zip）+ 撤销/重做。
 * 设计依据：持久化定调第 1/3 条。所有模型变更经 applyPatch 咽喉点，再标脏；不可变模型让历史栈几乎免费。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model } from '../core/types';
import type { Views } from '../core/serialize';
import {
  downloadProject,
  FsaStore,
  isFsaSupported,
  MemoryStore,
  pendingFolder,
  reconnectPendingFolder,
  restoreStore,
  ZipStore,
  type ModelStore,
  type StoreKind,
} from '../core/store';
import { sampleThreeLensModel, threeLensPositions } from '../core/sample-three-lens';
import { sortSessions, type ReasoningSession } from '../core/session';

export interface ProjectState {
  model: Model;
  views: Views;
  sessions: ReasoningSession[];
  storeKind: StoreKind;
  storeLabel: string;
  /** 上次用过的文件夹还在、但这次还没拿到权限（刷新后的常态）—— 记着名字好提示用户点一下。 */
  pendingFolder: string | null;
  reconnectFolder: () => Promise<void>;
  autoSave: boolean;
  dirty: boolean;
  saving: boolean;
  fsaSupported: boolean;
  setModel: (updater: Model | ((m: Model) => Model)) => void;
  setViews: (updater: Views | ((v: Views) => Views)) => void;
  /** 每次项目被加载/替换就 +1（UI 据此把场景、会话等派生状态重置）。 */
  loadedAt: number;
  saveSession: (session: ReasoningSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  openFolder: () => Promise<void>;
  importZip: (file: File) => Promise<void>;
  exportZip: () => void;
  saveNow: () => Promise<void>;
  loadSample: () => void;
}

const DEFAULT_VIEWS: Views = { architecture: { positions: {} }, er: { positions: {} }, 'state-machine': { positions: {} } };
const HISTORY_CAP = 60;

export function useProject(): ProjectState {
  const [model, setModelState] = useState<Model>(() => structuredClone(sampleThreeLensModel));
  const [views, setViewsState] = useState<Views>(() => structuredClone(DEFAULT_VIEWS));
  const [sessions, setSessions] = useState<ReasoningSession[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [store, setStore] = useState<ModelStore>(() => new MemoryStore());
  const [pending, setPending] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // 撤销/重做：不可变模型快照栈。historyTick 仅用于驱动 canUndo/canRedo 重渲染。
  const pastRef = useRef<Model[]>([]);
  const futureRef = useRef<Model[]>([]);
  const [, setHistoryTick] = useState(0);
  const bumpHistory = useCallback(() => setHistoryTick((v) => v + 1), []);
  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const storeRef = useRef(store);
  storeRef.current = store;
  const snapshotRef = useRef({ model, views, sessions });
  snapshotRef.current = { model, views, sessions };

  // 启动：尝试恢复上次 FSA 文件夹并加载；否则内存里放 sample。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await restoreStore();
      if (cancelled) return;
      const snap = await s.load();
      if (cancelled) return;
      setStore(s);
      setPending(pendingFolder()?.name ?? null);
      if (snap) {
        setModelState(snap.model);
        setViewsState(snap.views);
        setSessions(snap.sessions ?? []);
        setDirty(false);
        resetHistory();
        setLoadedAt((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resetHistory]);

  const setModel = useCallback(
    (updater: Model | ((m: Model) => Model)) => {
      const prev = snapshotRef.current.model;
      const next = typeof updater === 'function' ? (updater as (m: Model) => Model)(prev) : updater;
      if (next === prev) return;
      pastRef.current = [...pastRef.current.slice(-(HISTORY_CAP - 1)), prev];
      futureRef.current = [];
      setModelState(next);
      setDirty(true);
      bumpHistory();
    },
    [bumpHistory],
  );

  const setViews = useCallback((updater: Views | ((v: Views) => Views)) => {
    setViewsState((v) => (typeof updater === 'function' ? (updater as (v: Views) => Views)(v) : updater));
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    pastRef.current = past.slice(0, -1);
    futureRef.current = [snapshotRef.current.model, ...futureRef.current].slice(0, HISTORY_CAP);
    setModelState(prev);
    setDirty(true);
    bumpHistory();
  }, [bumpHistory]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0]!;
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current.slice(-(HISTORY_CAP - 1)), snapshotRef.current.model];
    setModelState(next);
    setDirty(true);
    bumpHistory();
  }, [bumpHistory]);

  const saveNow = useCallback(async () => {
    const s = storeRef.current;
    setSaving(true);
    try {
      await s.save(snapshotRef.current);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, []);

  // FSA 自动保存：脏后 debounce 800ms 落盘。zip/内存不自动存（诚实告知）。
  useEffect(() => {
    if (!dirty || !store.autoSave) return;
    const t = setTimeout(() => void saveNow(), 800);
    return () => clearTimeout(t);
  }, [dirty, model, views, store.autoSave, saveNow]);

  // 离开页面前提醒未保存（仅非自动保存路径）。
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && !storeRef.current.autoSave) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const openFolder = useCallback(async () => {
    if (!isFsaSupported()) return;
    const s = await FsaStore.pick();
    if (!s) return;
    setPending(null);
    const snap = await s.load();
    setStore(s);
    if (snap) {
      setModelState(snap.model);
      setViewsState(snap.views);
      setSessions(snap.sessions ?? []);
    } else {
      // 空文件夹：把当前模型作为新项目写入。
      setSessions([]);
      await s.save(snapshotRef.current);
    }
    setDirty(false);
    resetHistory();
    setLoadedAt((v) => v + 1);
  }, [resetHistory]);

  /**
   * 刷新后接回上次的文件夹：这一刻是用户点击（有手势），浏览器才允许 requestPermission。
   * 接上之后立刻把磁盘上的项目读进来 —— 这正是刷新前按下「重新布局」时的样子。
   */
  const reconnectFolder = useCallback(async () => {
    const s = await reconnectPendingFolder();
    if (!s) {
      setPending(null);
      return;
    }
    const snap = await s.load();
    setStore(s);
    setPending(null);
    if (snap) {
      setModelState(snap.model);
      setViewsState(snap.views);
      setSessions(snap.sessions ?? []);
    }
    setDirty(false);
    resetHistory();
    setLoadedAt((v) => v + 1);
  }, [resetHistory]);

  const importZip = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const s = ZipStore.fromBytes(bytes, file.name.replace(/\.devdraw\.zip$|\.zip$/i, ''));
      const snap = await s.load();
      setStore(s);
      if (snap) {
        setModelState(snap.model);
        setViewsState(snap.views);
        setSessions(snap.sessions ?? []);
      }
      setDirty(false);
      resetHistory();
      setLoadedAt((v) => v + 1);
    },
    [resetHistory],
  );

  const exportZip = useCallback(() => {
    downloadProject(snapshotRef.current);
    setDirty(false);
  }, []);

  const loadSample = useCallback(() => {
    setStore(new MemoryStore());
    setModelState(structuredClone(sampleThreeLensModel));
    setViewsState(structuredClone(DEFAULT_VIEWS));
    setSessions([]);
    setDirty(false);
    resetHistory();
    setLoadedAt((v) => v + 1);
  }, [resetHistory]);

  /** 会话立即落盘（不参与 debounce）：它是「思考的存档」，不该因为没保存而丢。 */
  const saveSession = useCallback(async (session: ReasoningSession) => {
    await storeRef.current.saveSession(session);
    setSessions((prev) => sortSessions([...prev.filter((s) => s.id !== session.id), session]));
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await storeRef.current.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    model,
    views,
    sessions,
    storeKind: store.kind,
    storeLabel: store.label,
    pendingFolder: pending,
    reconnectFolder,
    autoSave: store.autoSave,
    dirty,
    saving,
    fsaSupported: isFsaSupported(),
    setModel,
    setViews,
    loadedAt,
    saveSession,
    deleteSession,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undo,
    redo,
    openFolder,
    importZip,
    exportZip,
    saveNow,
    loadSample,
  };
}

/** 把 sample 的手写坐标作为初始视图布局（仅首次，无持久化布局时）。 */
export function samplePositions(): Record<string, { x: number; y: number }> {
  return threeLensPositions;
}

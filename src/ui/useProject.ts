/**
 * useProject —— 持久化状态 hook：ModelStore 接线 + 脏标记 + 自动保存（FSA）/手动导出（zip）。
 * 设计依据：持久化定调第 1/3 条。所有模型变更经 applyPatch 咽喉点，再标脏。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Model } from '../core/types';
import type { Views } from '../core/serialize';
import {
  downloadProject,
  FsaStore,
  isFsaSupported,
  MemoryStore,
  restoreStore,
  ZipStore,
  type ModelStore,
} from '../core/store';
import { sampleThreeLensModel, threeLensPositions } from '../core/sample-three-lens';

export interface ProjectState {
  model: Model;
  views: Views;
  storeLabel: string;
  autoSave: boolean;
  dirty: boolean;
  saving: boolean;
  fsaSupported: boolean;
  setModel: (updater: Model | ((m: Model) => Model)) => void;
  setViews: (updater: Views | ((v: Views) => Views)) => void;
  openFolder: () => Promise<void>;
  importZip: (file: File) => Promise<void>;
  exportZip: () => void;
  saveNow: () => Promise<void>;
  loadSample: () => void;
}

const DEFAULT_VIEWS: Views = { architecture: { positions: {} }, er: { positions: {} }, 'state-machine': { positions: {} } };

export function useProject(): ProjectState {
  const [model, setModelState] = useState<Model>(() => structuredClone(sampleThreeLensModel));
  const [views, setViewsState] = useState<Views>(() => structuredClone(DEFAULT_VIEWS));
  const [store, setStore] = useState<ModelStore>(() => new MemoryStore());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const storeRef = useRef(store);
  storeRef.current = store;
  const snapshotRef = useRef({ model, views });
  snapshotRef.current = { model, views };

  // 启动：尝试恢复上次 FSA 文件夹并加载；否则内存里放 sample。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await restoreStore();
      if (cancelled) return;
      const snap = await s.load();
      if (cancelled) return;
      setStore(s);
      if (snap) {
        setModelState(snap.model);
        setViewsState(snap.views);
        setDirty(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setModel = useCallback((updater: Model | ((m: Model) => Model)) => {
    setModelState((m) => (typeof updater === 'function' ? (updater as (m: Model) => Model)(m) : updater));
    setDirty(true);
  }, []);

  const setViews = useCallback((updater: Views | ((v: Views) => Views)) => {
    setViewsState((v) => (typeof updater === 'function' ? (updater as (v: Views) => Views)(v) : updater));
    setDirty(true);
  }, []);

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
    const snap = await s.load();
    setStore(s);
    if (snap) {
      setModelState(snap.model);
      setViewsState(snap.views);
    } else {
      // 空文件夹：把当前模型作为新项目写入。
      await s.save(snapshotRef.current);
    }
    setDirty(false);
  }, []);

  const importZip = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const s = ZipStore.fromBytes(bytes, file.name.replace(/\.devdraw\.zip$|\.zip$/i, ''));
    const snap = await s.load();
    setStore(s);
    if (snap) {
      setModelState(snap.model);
      setViewsState(snap.views);
    }
    setDirty(false);
  }, []);

  const exportZip = useCallback(() => {
    downloadProject(snapshotRef.current);
    setDirty(false);
  }, []);

  const loadSample = useCallback(() => {
    setStore(new MemoryStore());
    setModelState(structuredClone(sampleThreeLensModel));
    setViewsState(structuredClone(DEFAULT_VIEWS));
    setDirty(false);
  }, []);

  return {
    model,
    views,
    storeLabel: store.label,
    autoSave: store.autoSave,
    dirty,
    saving,
    fsaSupported: isFsaSupported(),
    setModel,
    setViews,
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

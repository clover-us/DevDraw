use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceFiles {
    pub root: String,
    pub files: BTreeMap<String, String>,
}

struct WatcherInner {
    generation: u64,
    last_self_write: Option<Instant>,
}

struct WorkspaceWatcherState(Arc<Mutex<WatcherInner>>);

impl Default for WorkspaceWatcherState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(WatcherInner {
            generation: 0,
            last_self_write: None,
        })))
    }
}

/// Prevent path traversal outside the opened workspace directory.
fn resolve_safe_path(root: &str, relative: &str) -> Result<PathBuf, String> {
    let base = Path::new(root);
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return Err("Relative path required".to_string());
    }
    for comp in rel.components() {
        if matches!(comp, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err("Invalid path component".to_string());
        }
    }
    Ok(base.join(rel))
}

fn is_tracked_workspace_file(name: &str) -> bool {
    name.ends_with(".arch") || name == "project.json" || name == ".arch-layout.json"
}

fn snapshot_workspace_fingerprint(root_path: &Path) -> BTreeMap<String, (u64, u128)> {
    let mut map = BTreeMap::new();
    if !root_path.exists() {
        return map;
    }
    let mut stack = vec![root_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "node_modules" || name == "target" {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() && is_tracked_workspace_file(&name) {
                if let (Ok(rel), Ok(meta)) = (path.strip_prefix(root_path), fs::metadata(&path)) {
                    let mtime_ms = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let key = rel.to_string_lossy().replace('\\', "/");
                    map.insert(key, (meta.len(), mtime_ms));
                }
            }
        }
    }
    map
}

#[tauri::command]
fn read_workspace_dir(root: String) -> Result<WorkspaceFiles, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(format!("Workspace directory does not exist: {root}"));
    }

    let mut files = BTreeMap::new();
    let mut stack = vec![root_path.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| format!("Read dir failed: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "node_modules" || name == "target" {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() && is_tracked_workspace_file(&name) {
                if let Ok(rel) = path.strip_prefix(root_path) {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let key = rel.to_string_lossy().replace('\\', "/");
                        files.insert(key, content);
                    }
                }
            }
        }
    }

    Ok(WorkspaceFiles { root, files })
}

#[tauri::command]
fn write_workspace_file(
    state: State<WorkspaceWatcherState>,
    root: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    if let Ok(mut guard) = state.0.lock() {
        guard.last_self_write = Some(Instant::now());
    }
    let target = resolve_safe_path(&root, &relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
    }
    fs::write(&target, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
fn write_workspace_files(
    state: State<WorkspaceWatcherState>,
    root: String,
    files: BTreeMap<String, String>,
) -> Result<(), String> {
    if let Ok(mut guard) = state.0.lock() {
        guard.last_self_write = Some(Instant::now());
    }
    let root_path = Path::new(&root);
    if !root_path.exists() {
        fs::create_dir_all(root_path).map_err(|e| format!("Failed to create dir: {e}"))?;
    }

    let expected_keys: HashSet<String> = files
        .keys()
        .map(|k| k.replace('\\', "/"))
        .collect();

    for (relative_path, content) in &files {
        let target = resolve_safe_path(&root, relative_path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
        }
        fs::write(&target, content).map_err(|e| format!("Failed to write {relative_path}: {e}"))?;
    }

    // Remove orphaned layers/*.arch files that were deleted from the project
    let layers_dir = root_path.join("layers");
    if layers_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&layers_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with(".arch") {
                        let rel = format!("layers/{name}");
                        if !expected_keys.contains(&rel) {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = state.0.lock() {
        guard.last_self_write = Some(Instant::now());
    }

    Ok(())
}

#[tauri::command]
fn watch_workspace_dir(
    app: AppHandle,
    state: State<WorkspaceWatcherState>,
    root: String,
) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err(format!("Workspace directory does not exist: {root}"));
    }

    let shared = Arc::clone(&state.0);
    let my_gen = {
        let mut guard = shared.lock().map_err(|_| "Watcher lock poisoned".to_string())?;
        guard.generation = guard.generation.wrapping_add(1);
        guard.generation
    };

    thread::spawn(move || {
        let mut prev = snapshot_workspace_fingerprint(&root_path);
        loop {
            thread::sleep(Duration::from_millis(750));
            let (current_gen, recent_self_write) = match shared.lock() {
                Ok(guard) => {
                    let recent = guard
                        .last_self_write
                        .map(|t| t.elapsed() < Duration::from_millis(1400))
                        .unwrap_or(false);
                    (guard.generation, recent)
                }
                Err(_) => break,
            };

            if current_gen != my_gen {
                break;
            }

            let next = snapshot_workspace_fingerprint(&root_path);
            if next != prev {
                prev = next;
                if !recent_self_write {
                    let _ = app.emit("workspace-changed", root.clone());
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn unwatch_workspace_dir(state: State<WorkspaceWatcherState>) {
    if let Ok(mut guard) = state.0.lock() {
        guard.generation = guard.generation.wrapping_add(1);
    }
}

#[tauri::command]
fn save_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
    }
    fs::write(target, bytes).map_err(|e| format!("Failed to write export file: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceWatcherState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_workspace_dir,
            write_workspace_file,
            write_workspace_files,
            watch_workspace_dir,
            unwatch_workspace_dir,
            save_export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevDraw desktop application");
}

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceFiles {
    pub root: String,
    pub files: BTreeMap<String, String>,
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
            } else if path.is_file() {
                let is_supported = name.ends_with(".arch")
                    || name == "project.json"
                    || name == ".arch-layout.json";
                if is_supported {
                    if let Ok(rel) = path.strip_prefix(root_path) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let key = rel.to_string_lossy().replace('\\', "/");
                            files.insert(key, content);
                        }
                    }
                }
            }
        }
    }

    Ok(WorkspaceFiles { root, files })
}

#[tauri::command]
fn write_workspace_file(root: String, relative_path: String, content: String) -> Result<(), String> {
    let target = resolve_safe_path(&root, &relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {e}"))?;
    }
    fs::write(&target, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
fn write_workspace_files(root: String, files: BTreeMap<String, String>) -> Result<(), String> {
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

    Ok(())
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_workspace_dir,
            write_workspace_file,
            write_workspace_files,
            save_export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevDraw desktop application");
}

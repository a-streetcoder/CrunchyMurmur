const COMMANDS: &[&str] = &["prepare", "transcribe", "diagnostics", "dispose"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

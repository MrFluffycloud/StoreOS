use tauri::Window;

#[tauri::command]
pub fn resize_to_login(window: Window) -> Result<(), String> {
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 400.0,
            height: 550.0,
        }))
        .map_err(|e| e.to_string())?;

    window.set_resizable(false).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_to_app(window: Window) -> Result<(), String> {
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.maximize().map_err(|e| e.to_string())?;
    Ok(())
}

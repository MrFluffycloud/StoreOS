use crate::database::connection::DbState;
use crate::models::inventory::{CreateInventoryMovementInput, InventoryMovement, InventorySummary};
use crate::repositories::inventory::InventoryRepository;
use tauri::State;

#[tauri::command]
pub fn add_inventory_movement(
    state: State<'_, DbState>,
    input: CreateInventoryMovementInput,
) -> Result<InventoryMovement, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    InventoryRepository::add_movement(&conn, input)
}

#[tauri::command]
pub fn list_inventory_movements(
    state: State<'_, DbState>,
) -> Result<Vec<InventoryMovement>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    InventoryRepository::list_movements(&conn)
}

#[tauri::command]
pub fn get_product_stock(state: State<'_, DbState>, product_id: String) -> Result<f64, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    InventoryRepository::get_stock(&conn, &product_id)
}

#[tauri::command]
pub fn get_inventory_summary(state: State<'_, DbState>) -> Result<Vec<InventorySummary>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    InventoryRepository::get_inventory_summary(&conn)
}

#[tauri::command]
pub fn delete_movements_by_reference_prefix(
    state: State<'_, DbState>,
    prefix: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM inventory_movements WHERE reference_id LIKE ?",
        [format!("{}%", prefix)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

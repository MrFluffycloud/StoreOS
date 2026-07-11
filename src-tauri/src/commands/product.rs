use crate::database::connection::DbState;
use crate::models::product::{CreateProductInput, Product};
use crate::repositories::product::ProductRepository;
use tauri::State;

#[tauri::command]
pub fn get_products(state: State<'_, DbState>) -> Result<Vec<Product>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    ProductRepository::list(&conn)
}

#[tauri::command]
pub fn get_product_by_id(state: State<'_, DbState>, id: String) -> Result<Option<Product>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    ProductRepository::get_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_product(
    state: State<'_, DbState>,
    input: CreateProductInput,
) -> Result<Product, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    ProductRepository::create(&conn, input)
}

#[tauri::command]
pub fn update_product(
    state: State<'_, DbState>,
    id: String,
    input: CreateProductInput,
) -> Result<Product, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    ProductRepository::update(&conn, &id, input)
}

#[tauri::command]
pub fn delete_product(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    ProductRepository::delete(&conn, &id)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProductRow {
    pub name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub description: Option<String>,
    pub price_cents: i64,
    pub cost_cents: i64,
    pub category: Option<String>,
    pub brand: Option<String>,
    pub image_url: Option<String>,
    pub gst_rate: Option<f64>,
    pub unit: Option<String>,
    pub stock: Option<f64>,
}

#[tauri::command]
pub fn import_products_batch(
    state: State<'_, DbState>,
    rows: Vec<ImportProductRow>,
) -> Result<String, String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut inserted = 0;
    let mut updated = 0;
    let mut movements = 0;

    for row in rows {
        if row.sku.is_empty() || row.name.is_empty() {
            continue;
        }

        // Check if exists
        let existing_id: Option<String> = tx
            .query_row("SELECT id FROM products WHERE sku = ?", [&row.sku], |r| {
                r.get(0)
            })
            .ok();

        let prod_id = match existing_id {
            Some(id) => {
                tx.execute(
                    "UPDATE products SET name = ?, category = ?, price_cents = ?, cost_cents = ?, brand = ?, image_url = ?, gst_rate = ?, unit = ?, updated_at = ? WHERE id = ?",
                    (
                        &row.name,
                        &row.category,
                        row.price_cents,
                        row.cost_cents,
                        &row.brand,
                        &row.image_url,
                        row.gst_rate.unwrap_or(0.0),
                        row.unit.as_deref().unwrap_or("PCs"),
                        &now,
                        &id,
                    ),
                ).map_err(|e| e.to_string())?;
                updated += 1;
                id
            }
            None => {
                let new_id = format!(
                    "prod-{}-{}",
                    &uuid::Uuid::new_v4().to_string()[..8],
                    &row.sku
                );
                tx.execute(
                    "INSERT INTO products (id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, gst_rate, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        &new_id,
                        &row.name,
                        &row.sku,
                        row.barcode.as_deref().unwrap_or(&row.sku),
                        row.description.as_deref().unwrap_or(""),
                        row.price_cents,
                        row.cost_cents,
                        row.category.as_deref().unwrap_or("General"),
                        &row.brand,
                        &row.image_url,
                        row.gst_rate.unwrap_or(0.0),
                        row.unit.as_deref().unwrap_or("PCs"),
                        &now,
                        &now,
                    ),
                ).map_err(|e| e.to_string())?;
                inserted += 1;
                new_id
            }
        };

        // Handle initial stock movement
        if let Some(stk) = row.stock {
            if stk > 0.0 {
                // Check if movements already exist
                let count: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM inventory_movements WHERE product_id = ?",
                        [&prod_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                if count == 0 {
                    let mov_id = format!(
                        "mov-init-{}-{}",
                        &uuid::Uuid::new_v4().to_string()[..8],
                        &row.sku
                    );
                    tx.execute(
                        "INSERT INTO inventory_movements (id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            &mov_id,
                            &prod_id,
                            stk,
                            "Adjustment",
                            "InitialImport",
                            "SPREADSHEET-IMPORT",
                            "system",
                            &now,
                        ),
                    ).map_err(|e| e.to_string())?;
                    movements += 1;
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!(
        "Successfully imported: {} inserted, {} updated, {} stock movements created.",
        inserted, updated, movements
    ))
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_suppliers(state: State<'_, DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, contact_name, email, phone, created_at FROM suppliers ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Supplier {
                id: row.get(0)?,
                name: row.get(1)?,
                contact_name: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn create_supplier(
    state: State<'_, DbState>,
    name: String,
    contact_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
) -> Result<Supplier, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let id = format!("sup-{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO suppliers (id, name, contact_name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (&id, &name, &contact_name, &email, &phone, &now),
    )
    .map_err(|e| e.to_string())?;

    Ok(Supplier {
        id,
        name,
        contact_name,
        email,
        phone,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_supplier(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM suppliers WHERE id = ?", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSupplierRow {
    pub name: String,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[tauri::command]
pub fn import_suppliers_batch(
    state: State<'_, DbState>,
    rows: Vec<ImportSupplierRow>,
) -> Result<String, String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut inserted = 0;
    let mut updated = 0;

    for row in rows {
        if row.name.trim().is_empty() {
            continue;
        }

        let clean_name = row.name.trim();

        // Check if exists
        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id FROM suppliers WHERE name = ?",
                [clean_name],
                |r| r.get(0),
            )
            .ok();

        match existing_id {
            Some(id) => {
                tx.execute(
                    "UPDATE suppliers SET contact_name = ?, email = ?, phone = ? WHERE id = ?",
                    (
                        row.contact_name.as_deref().map(|s| s.trim()),
                        row.email.as_deref().map(|s| s.trim()),
                        row.phone.as_deref().map(|s| s.trim()),
                        &id,
                    ),
                )
                .map_err(|e| e.to_string())?;
                updated += 1;
            }
            None => {
                let new_id = format!("sup-{}", &uuid::Uuid::new_v4().to_string()[..8]);
                tx.execute(
                    "INSERT INTO suppliers (id, name, contact_name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        &new_id,
                        clean_name,
                        row.contact_name.as_deref().map(|s| s.trim()),
                        row.email.as_deref().map(|s| s.trim()),
                        row.phone.as_deref().map(|s| s.trim()),
                        &now,
                    ),
                ).map_err(|e| e.to_string())?;
                inserted += 1;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!(
        "Successfully imported: {} suppliers inserted, {} updated.",
        inserted, updated
    ))
}

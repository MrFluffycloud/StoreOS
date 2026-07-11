use crate::models::product::{CreateProductInput, Product};
use rusqlite::{params, Connection, OptionalExtension};

pub struct ProductRepository;

impl ProductRepository {
    pub fn list(conn: &Connection) -> Result<Vec<Product>, String> {
        let mut stmt = conn
            .prepare("SELECT id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, COALESCE(gst_rate, 0.0), COALESCE(unit, 'PCs'), created_at, updated_at FROM products ORDER BY name ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sku: row.get(2)?,
                    barcode: row.get(3)?,
                    description: row.get(4)?,
                    price_cents: row.get(5)?,
                    cost_cents: row.get(6)?,
                    category: row.get(7)?,
                    brand: row.get(8)?,
                    image_url: row.get(9)?,
                    gst_rate: row.get(10)?,
                    unit: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut products = Vec::new();
        for row in rows {
            products.push(row.map_err(|e| e.to_string())?);
        }
        Ok(products)
    }

    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Product>, String> {
        conn.query_row(
            "SELECT id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, COALESCE(gst_rate, 0.0), COALESCE(unit, 'PCs'), created_at, updated_at FROM products WHERE id = ?",
            params![id],
            |row| {
                Ok(Product {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sku: row.get(2)?,
                    barcode: row.get(3)?,
                    description: row.get(4)?,
                    price_cents: row.get(5)?,
                    cost_cents: row.get(6)?,
                    category: row.get(7)?,
                    brand: row.get(8)?,
                    image_url: row.get(9)?,
                    gst_rate: row.get(10)?,
                    unit: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn create(conn: &Connection, input: CreateProductInput) -> Result<Product, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO products (id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, gst_rate, unit, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                input.name,
                input.sku,
                input.barcode,
                input.description,
                input.price_cents,
                input.cost_cents,
                input.category,
                input.brand,
                input.image_url,
                input.gst_rate.unwrap_or(0.0),
                input.unit.unwrap_or_else(|| "PCs".to_string()),
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        Self::get_by_id(conn, &id)?
            .ok_or_else(|| "Failed to retrieve newly created product".to_string())
    }

    pub fn update(
        conn: &Connection,
        id: &str,
        input: CreateProductInput,
    ) -> Result<Product, String> {
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE products SET name = ?, sku = ?, barcode = ?, description = ?, price_cents = ?, cost_cents = ?, category = ?, brand = ?, image_url = ?, gst_rate = ?, unit = ?, updated_at = ?
             WHERE id = ?",
            params![
                input.name,
                input.sku,
                input.barcode,
                input.description,
                input.price_cents,
                input.cost_cents,
                input.category,
                input.brand,
                input.image_url,
                input.gst_rate.unwrap_or(0.0),
                input.unit.unwrap_or_else(|| "PCs".to_string()),
                now,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

        Self::get_by_id(conn, id)?.ok_or_else(|| "Failed to retrieve updated product".to_string())
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute("DELETE FROM products WHERE id = ?", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

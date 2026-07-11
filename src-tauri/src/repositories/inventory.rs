use crate::models::inventory::{CreateInventoryMovementInput, InventoryMovement, InventorySummary};
use rusqlite::{params, Connection, OptionalExtension};

pub struct InventoryRepository;

impl InventoryRepository {
    pub fn add_movement(
        conn: &Connection,
        input: CreateInventoryMovementInput,
    ) -> Result<InventoryMovement, String> {
        if input.movement_type == "Sale" && input.quantity < 0.0 {
            let current_stock = Self::get_stock(conn, &input.product_id)?;
            if current_stock + input.quantity < 0.0 {
                return Err(format!(
                    "Insufficient stock for product. Available: {}, Requested: {}",
                    current_stock, -input.quantity
                ));
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO inventory_movements (id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                input.product_id,
                input.quantity,
                input.movement_type,
                input.reference_type,
                input.reference_id,
                input.employee_id,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        Self::get_movement_by_id(conn, &id)?
            .ok_or_else(|| "Failed to retrieve newly logged movement".to_string())
    }

    pub fn get_movement_by_id(
        conn: &Connection,
        id: &str,
    ) -> Result<Option<InventoryMovement>, String> {
        conn.query_row(
            "SELECT id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp FROM inventory_movements WHERE id = ?",
            params![id],
            |row| {
                Ok(InventoryMovement {
                    id: row.get(0)?,
                    product_id: row.get(1)?,
                    quantity: row.get(2)?,
                    movement_type: row.get(3)?,
                    reference_type: row.get(4)?,
                    reference_id: row.get(5)?,
                    employee_id: row.get(6)?,
                    timestamp: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn list_movements(conn: &Connection) -> Result<Vec<InventoryMovement>, String> {
        let mut stmt = conn
            .prepare("SELECT id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp FROM inventory_movements ORDER BY timestamp DESC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(InventoryMovement {
                    id: row.get(0)?,
                    product_id: row.get(1)?,
                    quantity: row.get(2)?,
                    movement_type: row.get(3)?,
                    reference_type: row.get(4)?,
                    reference_id: row.get(5)?,
                    employee_id: row.get(6)?,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut movements = Vec::new();
        for row in rows {
            movements.push(row.map_err(|e| e.to_string())?);
        }
        Ok(movements)
    }

    pub fn get_stock(conn: &Connection, product_id: &str) -> Result<f64, String> {
        let total: Option<f64> = conn
            .query_row(
                "SELECT SUM(quantity) FROM inventory_movements WHERE product_id = ?",
                params![product_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();

        Ok(total.unwrap_or(0.0))
    }

    pub fn get_inventory_summary(conn: &Connection) -> Result<Vec<InventorySummary>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.sku, p.name, COALESCE(SUM(i.quantity), 0.0)
                 FROM products p
                 LEFT JOIN inventory_movements i ON p.id = i.product_id
                 GROUP BY p.id
                 ORDER BY p.name ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(InventorySummary {
                    product_id: row.get(0)?,
                    sku: row.get(1)?,
                    product_name: row.get(2)?,
                    current_stock: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut summary = Vec::new();
        for row in rows {
            summary.push(row.map_err(|e| e.to_string())?);
        }
        Ok(summary)
    }
}

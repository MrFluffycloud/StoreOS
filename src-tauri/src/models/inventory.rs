use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InventoryMovement {
    pub id: String,
    pub product_id: String,
    pub quantity: f64,
    pub movement_type: String, // Purchase, Sale, Return, Damage, Adjustment, Transfer
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub employee_id: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateInventoryMovementInput {
    pub product_id: String,
    pub quantity: f64,
    pub movement_type: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub employee_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InventorySummary {
    pub product_id: String,
    pub sku: String,
    pub product_name: String,
    pub current_stock: f64,
}

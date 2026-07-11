use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductInput {
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
}

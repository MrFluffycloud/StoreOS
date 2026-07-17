use crate::database::connection::DbState;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub code: String,
    pub name: String,
    pub r#type: String, // Asset, Liability, Equity, Revenue, Expense
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JournalItem {
    pub id: String,
    pub account_code: String,
    pub account_name: String,
    pub debit_cents: i64,
    pub credit_cents: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub reference_type: String, // Sale, Purchase, Return, Payroll, Adjustment
    pub reference_id: String,
    pub description: Option<String>,
    pub timestamp: String,
    pub items: Vec<JournalItem>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewJournalItemInput {
    pub account_code: String,
    pub debit_cents: i64,
    pub credit_cents: i64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewJournalEntryInput {
    pub reference_type: String,
    pub reference_id: String,
    pub description: Option<String>,
    pub items: Vec<NewJournalItemInput>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountBalance {
    pub code: String,
    pub name: String,
    pub balance_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BalanceSheet {
    pub assets: Vec<AccountBalance>,
    pub liabilities: Vec<AccountBalance>,
    pub equity: Vec<AccountBalance>,
    pub total_assets_cents: i64,
    pub total_liabilities_cents: i64,
    pub total_equity_cents: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProfitLoss {
    pub revenues: Vec<AccountBalance>,
    pub expenses: Vec<AccountBalance>,
    pub total_revenue_cents: i64,
    pub total_expense_cents: i64,
    pub net_income_cents: i64,
}

#[tauri::command]
pub fn get_accounts(state: State<'_, DbState>) -> Result<Vec<Account>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT code, name, type FROM accounts ORDER BY code ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Account {
                code: row.get(0)?,
                name: row.get(1)?,
                r#type: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    for r in rows {
        accounts.push(r.map_err(|e| e.to_string())?);
    }
    Ok(accounts)
}

#[tauri::command]
pub fn get_journal_entries(state: State<'_, DbState>) -> Result<Vec<JournalEntry>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // 1. Fetch entries
    let mut stmt_entry = conn
        .prepare("SELECT id, reference_type, reference_id, description, timestamp FROM journal_entries ORDER BY timestamp DESC")
        .map_err(|e| e.to_string())?;

    let entry_rows = stmt_entry
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();

    for r in entry_rows {
        let (id, ref_type, ref_id, desc, ts) = r.map_err(|e| e.to_string())?;

        // 2. Fetch items for each entry
        let mut stmt_item = conn
            .prepare(
                "SELECT ji.id, ji.account_code, a.name, ji.debit_cents, ji.credit_cents 
                 FROM journal_items ji
                 JOIN accounts a ON ji.account_code = a.code
                 WHERE ji.journal_entry_id = ?",
            )
            .map_err(|e| e.to_string())?;

        let item_rows = stmt_item
            .query_map([&id], |row| {
                Ok(JournalItem {
                    id: row.get(0)?,
                    account_code: row.get(1)?,
                    account_name: row.get(2)?,
                    debit_cents: row.get(3)?,
                    credit_cents: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for it in item_rows {
            items.push(it.map_err(|e| e.to_string())?);
        }

        entries.push(JournalEntry {
            id,
            reference_type: ref_type,
            reference_id: ref_id,
            description: desc,
            timestamp: ts,
            items,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn create_manual_journal_entry(
    state: State<'_, DbState>,
    input: NewJournalEntryInput,
) -> Result<String, String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // Check double-entry balancing
    let mut total_debit = 0;
    let mut total_credit = 0;
    for it in &input.items {
        total_debit += it.debit_cents;
        total_credit += it.credit_cents;
    }

    if total_debit != total_credit {
        return Err(format!(
            "Transaction is unbalanced! Debits ({}) must equal Credits ({})",
            total_debit, total_credit
        ));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let entry_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    tx.execute(
        "INSERT INTO journal_entries (id, reference_type, reference_id, description, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![
            entry_id,
            input.reference_type,
            input.reference_id,
            input.description,
            now,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    for it in input.items {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO journal_items (id, journal_entry_id, account_code, debit_cents, credit_cents, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                item_id,
                entry_id,
                it.account_code,
                it.debit_cents,
                it.credit_cents,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(entry_id)
}

#[tauri::command]
pub fn get_balance_sheet(state: State<'_, DbState>) -> Result<BalanceSheet, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // 1. Fetch account net debits and credits
    let mut stmt = conn
        .prepare(
            "SELECT a.code, a.name, a.type, 
                    COALESCE(SUM(ji.debit_cents), 0) as total_debit, 
                    COALESCE(SUM(ji.credit_cents), 0) as total_credit
             FROM accounts a
             LEFT JOIN journal_items ji ON a.code = ji.account_code
             GROUP BY a.code",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    let mut equity = Vec::new();

    let mut total_assets = 0;
    let mut total_liabilities = 0;
    let mut total_equity = 0;

    // We'll calculate Retained Earnings separately based on Revenue - Expense
    let mut total_revenue = 0;
    let mut total_expense = 0;

    for r in rows {
        let (code, name, acct_type, debits, credits) = r.map_err(|e| e.to_string())?;
        
        match acct_type.as_str() {
            "Asset" => {
                let bal = debits - credits; // Asset = Debit - Credit
                assets.push(AccountBalance {
                    code,
                    name,
                    balance_cents: bal,
                });
                total_assets += bal;
            }
            "Liability" => {
                let bal = credits - debits; // Liability = Credit - Debit
                liabilities.push(AccountBalance {
                    code,
                    name,
                    balance_cents: bal,
                });
                total_liabilities += bal;
            }
            "Equity" => {
                let bal = credits - debits; // Equity = Credit - Debit
                equity.push(AccountBalance {
                    code,
                    name,
                    balance_cents: bal,
                });
                total_equity += bal;
            }
            "Revenue" => {
                total_revenue += credits - debits;
            }
            "Expense" => {
                total_expense += debits - credits;
            }
            _ => {}
        }
    }

    // Add Net Retained Earnings to equity
    let net_retained = total_revenue - total_expense;
    equity.push(AccountBalance {
        code: "3100".to_string(),
        name: "Current Net Profit (YTD)".to_string(),
        balance_cents: net_retained,
    });
    total_equity += net_retained;

    Ok(BalanceSheet {
        assets,
        liabilities,
        equity,
        total_assets_cents: total_assets,
        total_liabilities_cents: total_liabilities,
        total_equity_cents: total_equity,
    })
}

#[tauri::command]
pub fn get_profit_loss(state: State<'_, DbState>) -> Result<ProfitLoss, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT a.code, a.name, a.type, 
                    COALESCE(SUM(ji.debit_cents), 0) as total_debit, 
                    COALESCE(SUM(ji.credit_cents), 0) as total_credit
             FROM accounts a
             LEFT JOIN journal_items ji ON a.code = ji.account_code
             WHERE a.type IN ('Revenue', 'Expense')
             GROUP BY a.code",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut revenues = Vec::new();
    let mut expenses = Vec::new();

    let mut total_rev = 0;
    let mut total_exp = 0;

    for r in rows {
        let (code, name, acct_type, debits, credits) = r.map_err(|e| e.to_string())?;
        
        if acct_type == "Revenue" {
            let bal = credits - debits; // Revenue = Credit - Debit
            revenues.push(AccountBalance {
                code,
                name,
                balance_cents: bal,
            });
            total_rev += bal;
        } else if acct_type == "Expense" {
            let bal = debits - credits; // Expense = Debit - Credit
            expenses.push(AccountBalance {
                code,
                name,
                balance_cents: bal,
            });
            total_exp += bal;
        }
    }

    Ok(ProfitLoss {
        revenues,
        expenses,
        total_revenue_cents: total_rev,
        total_expense_cents: total_exp,
        net_income_cents: total_rev - total_exp,
    })
}

#[tauri::command]
pub fn delete_journal_entry(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM journal_items WHERE journal_entry_id = ?", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM journal_entries WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_manual_journal_entry(
    state: State<'_, DbState>,
    id: String,
    input: NewJournalEntryInput,
) -> Result<(), String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // Check double-entry balancing
    let mut total_debit = 0;
    let mut total_credit = 0;
    for it in &input.items {
        total_debit += it.debit_cents;
        total_credit += it.credit_cents;
    }

    if total_debit != total_credit {
        return Err(format!(
            "Transaction is unbalanced! Debits ({}) must equal Credits ({})",
            total_debit, total_credit
        ));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Update journal entry record
    tx.execute(
        "UPDATE journal_entries 
         SET reference_type = ?, reference_id = ?, description = ?, updated_at = ?
         WHERE id = ?",
        params![
            input.reference_type,
            input.reference_id,
            input.description,
            now,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    // Delete old items
    tx.execute("DELETE FROM journal_items WHERE journal_entry_id = ?", params![id])
        .map_err(|e| e.to_string())?;

    // Insert new items
    for it in input.items {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO journal_items (id, journal_entry_id, account_code, debit_cents, credit_cents, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                item_id,
                id,
                it.account_code,
                it.debit_cents,
                it.credit_cents,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

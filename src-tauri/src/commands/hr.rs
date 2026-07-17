use crate::database::connection::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;
use chrono::Datelike;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: String,
    pub user_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub base_salary_cents: i64,
    pub commission_rate: f64,
    pub status: String, // Active, Inactive
    pub pay_type: String, // Monthly, Daily
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceLog {
    pub id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub clock_in: String,
    pub clock_out: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PayrollRun {
    pub id: String,
    pub employee_id: String,
    pub employee_name: String,
    pub period_start: String,
    pub period_end: String,
    pub base_pay_cents: i64,
    pub commission_pay_cents: i64,
    pub total_pay_cents: i64,
    pub status: String, // Draft, Paid
    pub paid_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmployeeInput {
    pub user_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub base_salary_cents: i64,
    pub commission_rate: f64,
    pub pay_type: String,
}

#[tauri::command]
pub fn get_employees(state: State<'_, DbState>) -> Result<Vec<Employee>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, user_id, name, email, phone, base_salary_cents, commission_rate, status, pay_type, created_at FROM employees ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Employee {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
                base_salary_cents: row.get(5)?,
                commission_rate: row.get(6)?,
                status: row.get(7)?,
                pay_type: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut employees = Vec::new();
    for r in rows {
        employees.push(r.map_err(|e| e.to_string())?);
    }
    Ok(employees)
}

#[tauri::command]
pub fn create_employee(
    state: State<'_, DbState>,
    input: CreateEmployeeInput,
) -> Result<Employee, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO employees (id, user_id, name, email, phone, base_salary_cents, commission_rate, status, pay_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)",
        params![
            id,
            input.user_id,
            input.name,
            input.email,
            input.phone,
            input.base_salary_cents,
            input.commission_rate,
            input.pay_type,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Employee {
        id,
        user_id: input.user_id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        base_salary_cents: input.base_salary_cents,
        commission_rate: input.commission_rate,
        status: "Active".to_string(),
        pay_type: input.pay_type,
        created_at: now,
    })
}

#[tauri::command]
pub fn update_employee(
    state: State<'_, DbState>,
    id: String,
    name: String,
    email: Option<String>,
    phone: Option<String>,
    base_salary_cents: i64,
    commission_rate: f64,
    pay_type: String,
    status: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE employees SET name = ?, email = ?, phone = ?, base_salary_cents = ?, commission_rate = ?, pay_type = ?, status = ? WHERE id = ?",
        params![
            name,
            email,
            phone,
            base_salary_cents,
            commission_rate,
            pay_type,
            status,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_attendance_logs(state: State<'_, DbState>) -> Result<Vec<AttendanceLog>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.employee_id, e.name, a.clock_in, a.clock_out, a.created_at
             FROM attendance a
             JOIN employees e ON a.employee_id = e.id
             ORDER BY a.clock_in DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AttendanceLog {
                id: row.get(0)?,
                employee_id: row.get(1)?,
                employee_name: row.get(2)?,
                clock_in: row.get(3)?,
                clock_out: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for r in rows {
        logs.push(r.map_err(|e| e.to_string())?);
    }
    Ok(logs)
}

#[tauri::command]
pub fn clock_in_out(state: State<'_, DbState>, employee_id: String) -> Result<String, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // Check if active clock-in exists
    let active_id: Option<String> = conn
        .query_row(
            "SELECT id FROM attendance WHERE employee_id = ? AND clock_out IS NULL LIMIT 1",
            params![employee_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(id) = active_id {
        // Clock out
        conn.execute(
            "UPDATE attendance SET clock_out = ? WHERE id = ?",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok("Clocked Out".to_string())
    } else {
        // Clock in
        let new_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO attendance (id, employee_id, clock_in, clock_out, created_at)
             VALUES (?, ?, ?, NULL, ?)",
            params![new_id, employee_id, now, now],
        )
        .map_err(|e| e.to_string())?;
        Ok("Clocked In".to_string())
    }
}

#[tauri::command]
pub fn get_current_attendance_status(
    state: State<'_, DbState>,
    employee_id: String,
) -> Result<bool, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM attendance WHERE employee_id = ? AND clock_out IS NULL",
            params![employee_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn list_payroll_runs(state: State<'_, DbState>) -> Result<Vec<PayrollRun>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.employee_id, e.name, p.period_start, p.period_end, 
                    p.base_pay_cents, p.commission_pay_cents, p.total_pay_cents, 
                    p.status, p.paid_at, p.created_at
             FROM payroll_runs p
             JOIN employees e ON p.employee_id = e.id
             ORDER BY p.period_start DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PayrollRun {
                id: row.get(0)?,
                employee_id: row.get(1)?,
                employee_name: row.get(2)?,
                period_start: row.get(3)?,
                period_end: row.get(4)?,
                base_pay_cents: row.get(5)?,
                commission_pay_cents: row.get(6)?,
                total_pay_cents: row.get(7)?,
                status: row.get(8)?,
                paid_at: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut runs = Vec::new();
    for r in rows {
        runs.push(r.map_err(|e| e.to_string())?);
    }
    Ok(runs)
}

fn generate_payroll_run_internal(
    conn: &Connection,
    employee_id: &str,
    period_start: &str,
    period_end: &str,
) -> Result<PayrollRun, String> {
    // 1. Fetch employee details
    let emp: Employee = conn
        .query_row(
            "SELECT id, user_id, name, email, phone, base_salary_cents, commission_rate, status, pay_type, created_at 
             FROM employees WHERE id = ?",
            params![employee_id],
            |row| {
                Ok(Employee {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    email: row.get(3)?,
                    phone: row.get(4)?,
                    base_salary_cents: row.get(5)?,
                    commission_rate: row.get(6)?,
                    status: row.get(7)?,
                    pay_type: row.get(8)?,
                    created_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // 2. Fetch linked user login username if available
    let username: Option<String> = if let Some(ref uid) = emp.user_id {
        conn.query_row(
            "SELECT username FROM users WHERE id = ?",
            params![uid],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    } else {
        None
    };

    // 3. Calculate sales commissions
    let mut commission_cents = 0;
    if let Some(user_name) = username {
        // Query sales total in the period made by this user
        let sales_total: Option<i64> = conn
            .query_row(
                "SELECT SUM(ABS(i.quantity) * p.price_cents) 
                 FROM inventory_movements i
                 JOIN products p ON i.product_id = p.id
                 WHERE i.movement_type = 'Sale' 
                   AND i.employee_id = ? 
                   AND i.timestamp >= ? 
                   AND i.timestamp <= ?",
                params![user_name, period_start, period_end],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();

        if let Some(total_sales) = sales_total {
            commission_cents = (total_sales as f64 * emp.commission_rate) as i64;
        }
    }

    let base_pay = if emp.pay_type == "Daily" {
        // Count distinct days on which employee clocked in during the period
        let days_worked: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT DATE(clock_in)) 
                 FROM attendance 
                 WHERE employee_id = ? 
                   AND DATE(clock_in) >= DATE(?) 
                   AND DATE(clock_in) <= DATE(?)",
                params![employee_id, period_start, period_end],
                |row| row.get(0),
            )
            .unwrap_or(0);
        emp.base_salary_cents * days_worked
    } else {
        emp.base_salary_cents
    };
    let total_pay = base_pay + commission_cents;
    let run_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO payroll_runs (id, employee_id, period_start, period_end, base_pay_cents, commission_pay_cents, total_pay_cents, status, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', NULL, ?)",
        params![
            run_id,
            employee_id,
            period_start,
            period_end,
            base_pay,
            commission_cents,
            total_pay,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(PayrollRun {
        id: run_id,
        employee_id: employee_id.to_string(),
        employee_name: emp.name,
        period_start: period_start.to_string(),
        period_end: period_end.to_string(),
        base_pay_cents: base_pay,
        commission_pay_cents: commission_cents,
        total_pay_cents: total_pay,
        status: "Draft".to_string(),
        paid_at: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn generate_payroll_run(
    state: State<'_, DbState>,
    employee_id: String,
    period_start: String,
    period_end: String,
) -> Result<PayrollRun, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    generate_payroll_run_internal(&conn, &employee_id, &period_start, &period_end)
}

#[tauri::command]
pub fn run_auto_payroll(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // 1. Get setting: auto_payroll_enabled
    let enabled: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'auto_payroll_enabled'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "false".to_string());

    if enabled != "true" {
        return Ok(None);
    }

    // 2. Get setting: auto_payroll_schedule
    let schedule: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'auto_payroll_schedule'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "Monthly".to_string());

    // 3. Determine previous period start & end
    let now = chrono::Utc::now();
    let (period_start, period_end) = match schedule.as_str() {
        "Weekly" => {
            let current_weekday = now.weekday().num_days_from_monday(); // 0 for Mon, 6 for Sun
            let sunday_offset = current_weekday + 1; // days ago Sunday was
            let end_date = now - chrono::Duration::days(sunday_offset as i64);
            let start_date = end_date - chrono::Duration::days(6);
            
            let start_str = format!("{}T00:00:00Z", start_date.format("%Y-%m-%d"));
            let end_str = format!("{}T23:59:59Z", end_date.format("%Y-%m-%d"));
            (start_str, end_str)
        }
        _ => {
            // Monthly: Previous calendar month
            let mut year = now.year();
            let mut month = now.month() as i32 - 1;
            if month == 0 {
                month = 12;
                year -= 1;
            }
            let end_day = match month {
                1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
                4 | 6 | 9 | 11 => 30,
                2 => {
                    if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                        29
                    } else {
                        28
                    }
                }
                _ => 30,
            };

            let start_str = format!("{:04}-{:02}-01T00:00:00Z", year, month);
            let end_str = format!("{:04}-{:02}-{:02}T23:59:59Z", year, month, end_day);
            (start_str, end_str)
        }
    };

    // 4. Check if already run for this period
    let last_run: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'auto_payroll_last_run'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "".to_string());

    let period_key = format!("{}_{}", period_start, period_end);
    if last_run == period_key {
        return Ok(None);
    }

    // 5. Fetch all active employees
    let mut stmt = conn
        .prepare("SELECT id FROM employees WHERE status = 'Active'")
        .map_err(|e| e.to_string())?;
    let emp_ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut generated_count = 0;
    for emp_id in emp_ids {
        // Check if payroll draft already exists for this employee and period
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM payroll_runs 
                 WHERE employee_id = ? AND period_start = ? AND period_end = ?",
                params![emp_id, period_start, period_end],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if exists == 0 {
            match generate_payroll_run_internal(&conn, &emp_id, &period_start, &period_end) {
                Ok(_) => { generated_count += 1; }
                Err(e) => {
                    log::error!("Failed to auto-draft payroll for employee {}: {}", emp_id, e);
                }
            }
        }
    }

    // 6. Update last run setting
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('auto_payroll_last_run', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![period_key],
    )
    .map_err(|e| e.to_string())?;

    if generated_count > 0 {
        let period_label = if schedule == "Weekly" { "previous week" } else { "previous month" };
        Ok(Some(format!(
            "Successfully generated {} auto-payroll drafts for the {}.",
            generated_count, period_label
        )))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn pay_payroll_run(state: State<'_, DbState>, run_id: String) -> Result<(), String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // 1. Fetch the payroll run
    let run: PayrollRun = conn
        .query_row(
            "SELECT pr.id, pr.employee_id, e.name, pr.period_start, pr.period_end, 
                    pr.base_pay_cents, pr.commission_pay_cents, pr.total_pay_cents, 
                    pr.status, pr.paid_at, pr.created_at
             FROM payroll_runs pr
             JOIN employees e ON pr.employee_id = e.id
             WHERE pr.id = ?",
            params![run_id],
            |row| {
                Ok(PayrollRun {
                    id: row.get(0)?,
                    employee_id: row.get(1)?,
                    employee_name: row.get(2)?,
                    period_start: row.get(3)?,
                    period_end: row.get(4)?,
                    base_pay_cents: row.get(5)?,
                    commission_pay_cents: row.get(6)?,
                    total_pay_cents: row.get(7)?,
                    status: row.get(8)?,
                    paid_at: row.get(9)?,
                    created_at: row.get(10)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    if run.status == "Paid" {
        return Err("Payroll run is already paid!".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // 2. Update status
    tx.execute(
        "UPDATE payroll_runs SET status = 'Paid', paid_at = ? WHERE id = ?",
        params![now, run_id],
    )
    .map_err(|e| e.to_string())?;

    // 3. Create double-entry bookkeeping journal entry
    let journal_id = Uuid::new_v4().to_string();
    let desc = format!(
        "Payroll payment for {} - Period: {} to {}",
        run.employee_name, run.period_start, run.period_end
    );

    tx.execute(
        "INSERT INTO journal_entries (id, reference_type, reference_id, description, timestamp, created_at)
         VALUES (?, 'Payroll', ?, ?, ?, ?)",
        params![journal_id, run_id, desc, now, now],
    )
    .map_err(|e| e.to_string())?;

    // Debit Payroll Expense (6000)
    let item_debit_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO journal_items (id, journal_entry_id, account_code, debit_cents, credit_cents, created_at)
         VALUES (?, ?, '6000', ?, 0, ?)",
        params![item_debit_id, journal_id, run.total_pay_cents, now],
    )
    .map_err(|e| e.to_string())?;

    // Credit Cash (1010)
    let item_credit_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO journal_items (id, journal_entry_id, account_code, debit_cents, credit_cents, created_at)
         VALUES (?, ?, '1010', 0, ?, ?)",
        params![item_credit_id, journal_id, run.total_pay_cents, now],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

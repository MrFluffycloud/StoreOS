pub mod commands;
pub mod database;
pub mod models;
pub mod repositories;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database and migrations
            let pool = database::connection::init_db(app.handle())
                .expect("Failed to initialize SQLite database");

            // Store the connection pool in Tauri state
            app.manage(database::connection::DbState { pool });

            // Start the local mobile scanner web server
            commands::scanner_server::start_scanner_server(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::product::get_products,
            commands::product::get_product_by_id,
            commands::product::create_product,
            commands::product::update_product,
            commands::product::delete_product,
            commands::product::import_products_batch,
            commands::product::get_suppliers,
            commands::product::create_supplier,
            commands::product::delete_supplier,
            commands::product::import_suppliers_batch,
            commands::inventory::add_inventory_movement,
            commands::inventory::list_inventory_movements,
            commands::inventory::get_product_stock,
            commands::inventory::get_inventory_summary,
            commands::inventory::delete_movements_by_reference_prefix,
            commands::settings::get_settings,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::reset_store,
            commands::settings::list_system_printers,
            commands::auth::login_user,
            commands::auth::get_users,
            commands::auth::create_user,
            commands::auth::update_user,
            commands::auth::delete_user,
            commands::window::resize_to_login,
            commands::window::resize_to_app,
            commands::sync::sync_database,
            commands::sync::verify_license_key,
            commands::sync::replicate_table,
            commands::scanner_server::approve_device,
            commands::scanner_server::disconnect_device,
            commands::scanner_server::get_local_ip,
            commands::scanner_server::print_receipt_silent,
            commands::scanner_server::print_receipt_raw,
            commands::scanner_server::save_receipt_pdf,
            commands::ai::call_gemini,
            commands::health::get_system_health,
            commands::finance::get_accounts,
            commands::finance::get_journal_entries,
            commands::finance::create_manual_journal_entry,
            commands::finance::update_manual_journal_entry,
            commands::finance::delete_journal_entry,
            commands::finance::get_balance_sheet,
            commands::finance::get_profit_loss,
            commands::hr::get_employees,
            commands::hr::create_employee,
            commands::hr::update_employee,
            commands::hr::get_attendance_logs,
            commands::hr::clock_in_out,
            commands::hr::get_current_attendance_status,
            commands::hr::list_payroll_runs,
            commands::hr::generate_payroll_run,
            commands::hr::run_auto_payroll,
            commands::hr::pay_payroll_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

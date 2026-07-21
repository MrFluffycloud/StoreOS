import { Product, CreateProductInput, InventoryMovement, CreateInventoryMovementInput, InventorySummary, Setting, Supplier, CreateSupplierInput } from "@/types/storeos";

// Check if running inside the Tauri container
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && ((window as any).__TAURI__ !== undefined || (window as any).__TAURI_INTERNALS__ !== undefined);
};

// Safe invoke function that guards against build-time execution and provides fallback mocks
async function safeInvoke<T>(cmd: string, args?: Record<string, any>, fallbackData?: T): Promise<T> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    } catch (error) {
      if (cmd === "sync_database") {
        console.warn(`Tauri sync database failed (expected when offline or credentials missing):`, error);
      } else {
        console.error(`Tauri invoke error for cmd "${cmd}":`, error);
      }
      throw error;
    }
  } else {
    console.warn(`Tauri is not available. Mocking response for "${cmd}".`);
    if (fallbackData !== undefined) {
      return Promise.resolve(fallbackData);
    }
    throw new Error(`Tauri context not available and no mock fallback specified for command: ${cmd}`);
  }
}

// ----------------- IPC Wrapper API -----------------

export const getProducts = () => safeInvoke<Product[]>("get_products", {}, [
  {
    id: "prod-1",
    name: "Cast Iron Skillet 12-inch",
    sku: "HK-CIS-12",
    barcode: "071981200124",
    description: "Pre-seasoned heavy-duty cast iron skillet.",
    priceCents: 4999,
    costCents: 2200,
    category: "Cookware",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-2",
    name: "Chef Knives Block Set (15-Piece)",
    sku: "HK-KBS-15",
    barcode: "071981200155",
    description: "High-carbon stainless steel knife set.",
    priceCents: 12999,
    costCents: 5500,
    category: "Cutlery",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]);

export const getProductById = (id: string) => safeInvoke<Product | null>("get_product_by_id", { id }, null);

export const createProduct = (input: CreateProductInput) => 
  safeInvoke<Product>("create_product", { input });

export interface ImportProductRowInput {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  priceCents: number;
  costCents: number;
  category?: string;
  stock?: number;
}

export const importProductsBatch = (rows: ImportProductRowInput[]) =>
  safeInvoke<string>("import_products_batch", { rows }, "Mocked batch import of " + rows.length + " products successful.");

export const updateProduct = (id: string, input: CreateProductInput) => 
  safeInvoke<Product>("update_product", { id, input });

export const deleteProduct = (id: string) => safeInvoke<void>("delete_product", { id });

export const addInventoryMovement = (input: CreateInventoryMovementInput) => 
  safeInvoke<InventoryMovement>("add_inventory_movement", { input });

export const listInventoryMovements = () => safeInvoke<InventoryMovement[]>("list_inventory_movements", {}, [
  {
    id: "mov-1",
    productId: "prod-1",
    quantity: 50,
    movementType: "Purchase",
    referenceType: "SupplierOrder",
    referenceId: "SO-001",
    employeeId: "system",
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString() // 1 day ago
  },
  {
    id: "mov-2",
    productId: "prod-1",
    quantity: -5,
    movementType: "Sale",
    referenceType: "POSReceipt",
    referenceId: "REC-1001",
    employeeId: "emp_01",
    timestamp: new Date().toISOString()
  }
]);

export const getProductStock = (productId: string) => safeInvoke<number>("get_product_stock", { productId }, 45);

export const getInventorySummary = () => safeInvoke<InventorySummary[]>("get_inventory_summary", {}, [
  {
    productId: "prod-1",
    sku: "HK-CIS-12",
    productName: "Cast Iron Skillet 12-inch",
    currentStock: 45
  },
  {
    productId: "prod-2",
    sku: "HK-KBS-15",
    productName: "Chef Knives Block Set (15-Piece)",
    currentStock: 20
  }
]);

export const getSettings = () => safeInvoke<Setting[]>("get_settings", {}, [
  { key: "store_name", value: "StoreOS Home & Kitchen" },
  { key: "currency", value: "USD" },
  { key: "tax_rate", value: "0.0825" },
  { key: "onboarded", value: "false" },
  { key: "theme_color", value: "slate" },
  { key: "product_id_format", value: "sku_barcode" },
  { key: "sync_status", value: "Synced" },
  { key: "last_sync_time", value: "Never" }
]);

export const getSetting = (key: string) => safeInvoke<string | null>("get_setting", { key }, "StoreOS Home & Kitchen");

export const setSetting = (key: string, value: string) => safeInvoke<void>("set_setting", { key, value });

export const loginUser = (pin: string) => safeInvoke<{ username: string; role: string } | null>("login_user", { pin }, null);

export const syncDatabase = () => safeInvoke<string>("sync_database", {}, new Date().toISOString());

export const resetStore = () => safeInvoke<void>("reset_store", {}, undefined);

export const getUsers = () => safeInvoke<{ id: string; username: string; pin: string; role: string; createdAt: string }[]>("get_users", {}, []);

export const createUser = (input: { username: string; pin: string; role: string }) => safeInvoke<{ id: string; username: string; pin: string; role: string; createdAt: string }>("create_user", { input });

export const updateUser = (id: string, username: string, pin: string, role: string) => safeInvoke<void>("update_user", { id, username, pin, role });

export const deleteUser = (id: string, currentUsername: string) => safeInvoke<void>("delete_user", { id, currentUsername });

export const getSuppliers = () => safeInvoke<Supplier[]>("get_suppliers", {}, []);

export const createSupplier = (name: string, contactName?: string, email?: string, phone?: string) => 
  safeInvoke<Supplier>("create_supplier", { name, contactName, email, phone });

export const deleteSupplier = (id: string) => safeInvoke<void>("delete_supplier", { id });

export interface ImportSupplierRowInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export const importSuppliersBatch = (rows: ImportSupplierRowInput[]) =>
  safeInvoke<string>("import_suppliers_batch", { rows }, "Mocked batch import of " + rows.length + " suppliers successful.");

export const deleteMovementsByReferencePrefix = (prefix: string) =>
  safeInvoke<void>("delete_movements_by_reference_prefix", { prefix });

export const listSystemPrinters = () => safeInvoke<string[]>("list_system_printers", {}, [
  "Epson TM-T88VI (Mock)",
  "Star TSP100 (Mock)",
  "Xprinter XP-N160I (Mock)",
  "Microsoft Print to PDF"
]);

export const getLocalIp = () => safeInvoke<string>("get_local_ip", {}, "192.168.137.1");
export const approveDevice = (ip: string, approve: boolean, productsJson: string) => safeInvoke<void>("approve_device", { ip, approve, productsJson }, undefined);
export const disconnectDevice = (ip: string) => safeInvoke<void>("disconnect_device", { ip }, undefined);
export const printReceiptSilent = (printerName: string, htmlContent: string) => safeInvoke<string>("print_receipt_silent", { printerName, htmlContent }, "");
export const printReceiptRaw = (printerName: string, textContent: string) => safeInvoke<string>("print_receipt_raw", { printerName, textContent }, "");
export const saveReceiptPdf = (htmlContent: string, filename: string) => safeInvoke<string>("save_receipt_pdf", { htmlContent, filename }, "");

// System Health
export interface SystemHealth {
  app_version: string;
  platform: string;
  arch: string;
  db_size_bytes: number;
  total_products: number;
  total_movements: number;
  total_suppliers: number;
  total_users: number;
  db_status: string;
}

export const getSystemHealth = () => safeInvoke<SystemHealth>("get_system_health", {}, {
  app_version: "0.2.2",
  platform: "Web",
  arch: "wasm",
  db_size_bytes: 0,
  total_products: 0,
  total_movements: 0,
  total_suppliers: 0,
  total_users: 0,
  db_status: "Mock",
});

// Update Checker IPC wrappers
export interface UpdateInfo {
  available: boolean;
  version: string;
  body?: string;
}

export const checkForUpdateInfo = async (): Promise<UpdateInfo | null> => {
  if (isTauri()) {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        return {
          available: true,
          version: update.version,
          body: update.body,
        };
      }
      return { available: false, version: "" };
    } catch (err) {
      console.warn("Updater check skipped (Release server not set up or offline):", err);
      return null;
    }
  } else {
    // Mock update check
    return { available: false, version: "" };
  }
};

export const installAndRestartUpdate = async (): Promise<void> => {
  if (isTauri()) {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      console.error("Download/Install failed:", err);
      throw err;
    }
  } else {
    console.log("Mock install and relaunch update.");
  }
};

// Security Hardening Sync IPCs
export interface VerifyLicenseResult {
  success: boolean;
  storeId?: string;
  error?: string;
}

export const verifyLicenseKey = (licenseKey: string) =>
  safeInvoke<VerifyLicenseResult>("verify_license_key", { licenseKey }, {
    success: true,
    storeId: "store_mockstore",
  });

export const replicateTable = (table: string) =>
  safeInvoke<void>("replicate_table", { table });

export const getAppVersion = async (): Promise<string> => {
  if (isTauri()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch (e) {
      console.error("Failed to get Tauri app version", e);
      return "0.2.2";
    }
  }
  return "0.2.2";
};

export const callGemini = (contentsJson: string, systemInstruction?: string) =>
  safeInvoke<string>(
    "call_gemini",
    { contentsJson, systemInstruction },
    "Mocked AI Advisor response: Database context analyzed. Launch the Tauri app to interact with the real AI Advisor model."
  );

export const listAiModels = () =>
  safeInvoke<string[]>("list_ai_models", {}, ["gpt-4.1", "gpt-4.1-mini", "deepseek-v3"]);

// Finance & Double-Entry Accounting
export interface Account {
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
}

export interface AccountLedgerTransaction {
  id: string;
  journalEntryId: string;
  timestamp: string;
  referenceType: string;
  referenceId: string;
  description?: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

export interface AccountLedgerDetails {
  account: Account;
  totalDebitCents: number;
  totalCreditCents: number;
  currentBalanceCents: number;
  transactions: AccountLedgerTransaction[];
}

let mockAccountsList: Account[] = [
  { code: "1010", name: "Cash", type: "Asset" },
  { code: "1020", name: "Bank / Electronic", type: "Asset" },
  { code: "1200", name: "Inventory Asset", type: "Asset" },
  { code: "2000", name: "Accounts Payable", type: "Liability" },
  { code: "2100", name: "Payroll Payable", type: "Liability" },
  { code: "3000", name: "Retained Earnings", type: "Equity" },
  { code: "4000", name: "Sales Revenue", type: "Revenue" },
  { code: "4100", name: "Sales Returns & Allowances", type: "Revenue" },
  { code: "5000", name: "Cost of Goods Sold", type: "Expense" },
  { code: "6000", name: "Payroll Expense", type: "Expense" },
  { code: "6100", name: "General Operations Expense", type: "Expense" },
];

export const getAccounts = () =>
  safeInvoke<Account[]>("get_accounts", {}, mockAccountsList);

export const createAccount = async (input: CreateAccountInput): Promise<Account> => {
  if (isTauri()) {
    return safeInvoke<Account>("create_account", { input });
  } else {
    const existing = mockAccountsList.find((a) => a.code === input.code);
    if (existing) {
      throw new Error(`Account code '${input.code}' already exists.`);
    }
    const newAcct: Account = {
      code: input.code.trim(),
      name: input.name.trim(),
      type: input.type,
    };
    mockAccountsList.push(newAcct);
    mockAccountsList.sort((a, b) => a.code.localeCompare(b.code));
    return newAcct;
  }
};

export const getAccountLedger = async (code: string): Promise<AccountLedgerDetails> => {
  if (isTauri()) {
    return safeInvoke<AccountLedgerDetails>("get_account_ledger", { code });
  } else {
    const acct = mockAccountsList.find((a) => a.code === code) || {
      code,
      name: code === "1010" ? "Cash" : "General Account",
      type: "Asset" as const,
    };

    // Pre-populated mock transactions for browser preview
    let rawTransactions: Array<{
      id: string;
      journalEntryId: string;
      timestamp: string;
      referenceType: string;
      referenceId: string;
      description?: string;
      debitCents: number;
      creditCents: number;
    }> = [];

    const now = new Date();
    const ago = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();

    if (code === "1010") { // Cash Account
      rawTransactions = [
        { id: "tx-1", journalEntryId: "je-101", timestamp: ago(48), referenceType: "POS Sale", referenceId: "POS-1001", description: "Daily POS Register Cash Sales", debitCents: 45000, creditCents: 0 },
        { id: "tx-2", journalEntryId: "je-102", timestamp: ago(36), referenceType: "POS Sale", referenceId: "POS-1002", description: "Counter Cash Transactions", debitCents: 32000, creditCents: 0 },
        { id: "tx-3", journalEntryId: "je-103", timestamp: ago(24), referenceType: "Purchase", referenceId: "SUP-201", description: "Supplier Cash Purchase for Fresh Stock", debitCents: 0, creditCents: 12000 },
        { id: "tx-4", journalEntryId: "je-104", timestamp: ago(18), referenceType: "Adjustment", referenceId: "MAN-001", description: "Petty Cash Store Maintenance Expense", debitCents: 0, creditCents: 3500 },
        { id: "tx-5", journalEntryId: "je-105", timestamp: ago(12), referenceType: "POS Sale", referenceId: "POS-1003", description: "Customer Counter Cash Receipt", debitCents: 18500, creditCents: 0 },
        { id: "tx-6", journalEntryId: "je-106", timestamp: ago(4), referenceType: "Bank Transfer", referenceId: "TRF-881", description: "Cash Deposit to Main Bank Account", debitCents: 0, creditCents: 30000 },
      ];
    } else if (code === "1020") { // Bank Account
      rawTransactions = [
        { id: "tx-b1", journalEntryId: "je-201", timestamp: ago(72), referenceType: "Opening", referenceId: "INIT-001", description: "Initial Bank Balance", debitCents: 500000, creditCents: 0 },
        { id: "tx-b2", journalEntryId: "je-202", timestamp: ago(48), referenceType: "POS Batch", referenceId: "CARD-991", description: "Visa / Mastercard Daily Terminal Payout", debitCents: 125000, creditCents: 0 },
        { id: "tx-b3", journalEntryId: "je-203", timestamp: ago(30), referenceType: "Purchase", referenceId: "PAY-402", description: "Vendor Electronic Bank Transfer", debitCents: 0, creditCents: 85000 },
        { id: "tx-b4", journalEntryId: "je-204", timestamp: ago(10), referenceType: "Payroll", referenceId: "PAYROLL-771", description: "Employee Salary Direct Deposit Batch", debitCents: 0, creditCents: 150000 },
        { id: "tx-b5", journalEntryId: "je-205", timestamp: ago(4), referenceType: "Bank Transfer", referenceId: "TRF-881", description: "Cash Deposit Received from Register", debitCents: 30000, creditCents: 0 },
      ];
    } else if (code === "4000") { // Sales Revenue
      rawTransactions = [
        { id: "tx-r1", journalEntryId: "je-101", timestamp: ago(48), referenceType: "POS Sale", referenceId: "POS-1001", description: "Cash Register Sales Revenue", debitCents: 0, creditCents: 45000 },
        { id: "tx-r2", journalEntryId: "je-102", timestamp: ago(36), referenceType: "POS Sale", referenceId: "POS-1002", description: "Cash Sales Batch", debitCents: 0, creditCents: 32000 },
        { id: "tx-r3", journalEntryId: "je-202", timestamp: ago(48), referenceType: "Card Sale", referenceId: "CARD-991", description: "Card Terminal Sales Revenue", debitCents: 0, creditCents: 125000 },
        { id: "tx-r4", journalEntryId: "je-105", timestamp: ago(12), referenceType: "POS Sale", referenceId: "POS-1003", description: "Counter Sales Revenue", debitCents: 0, creditCents: 18500 },
      ];
    } else if (code === "1200") { // Inventory Asset
      rawTransactions = [
        { id: "tx-i1", journalEntryId: "je-301", timestamp: ago(96), referenceType: "Purchase", referenceId: "PO-1001", description: "Stock Purchase Receipt - Skillets & Knives", debitCents: 350000, creditCents: 0 },
        { id: "tx-i2", journalEntryId: "je-101", timestamp: ago(48), referenceType: "COGS Deduction", referenceId: "POS-1001", description: "Inventory Valuation Outflow", debitCents: 0, creditCents: 18000 },
        { id: "tx-i3", journalEntryId: "je-103", timestamp: ago(24), referenceType: "Purchase", referenceId: "SUP-201", description: "Supplier Stock Restock", debitCents: 12000, creditCents: 0 },
      ];
    } else if (code === "5000") { // COGS
      rawTransactions = [
        { id: "tx-c1", journalEntryId: "je-101", timestamp: ago(48), referenceType: "COGS", referenceId: "POS-1001", description: "Cost of Goods Sold - POS Batch", debitCents: 18000, creditCents: 0 },
        { id: "tx-c2", journalEntryId: "je-102", timestamp: ago(36), referenceType: "COGS", referenceId: "POS-1002", description: "Cost of Goods Sold - Counter", debitCents: 14000, creditCents: 0 },
        { id: "tx-c3", journalEntryId: "je-202", timestamp: ago(48), referenceType: "COGS", referenceId: "CARD-991", description: "Cost of Goods Sold - Card Terminal", debitCents: 55000, creditCents: 0 },
      ];
    }

    const isDebitNormal = acct.type === "Asset" || acct.type === "Expense";
    let runningBalanceCents = 0;
    let totalDebitCents = 0;
    let totalCreditCents = 0;

    const processedTx: AccountLedgerTransaction[] = rawTransactions.map((tx) => {
      totalDebitCents += tx.debitCents;
      totalCreditCents += tx.creditCents;
      if (isDebitNormal) {
        runningBalanceCents += tx.debitCents - tx.creditCents;
      } else {
        runningBalanceCents += tx.creditCents - tx.debitCents;
      }
      return {
        ...tx,
        runningBalanceCents,
      };
    });

    return {
      account: acct,
      totalDebitCents,
      totalCreditCents,
      currentBalanceCents: runningBalanceCents,
      transactions: processedTx,
    };
  }
};

export const getJournalEntries = () =>
  safeInvoke<any[]>("get_journal_entries", {}, []);

export const createManualJournalEntry = (input: any) =>
  safeInvoke<string>("create_manual_journal_entry", { input }, "mock-entry-id");

export const updateManualJournalEntry = (id: string, input: any) =>
  safeInvoke<void>("update_manual_journal_entry", { id, input }, undefined);

export const deleteJournalEntry = (id: string) =>
  safeInvoke<void>("delete_journal_entry", { id }, undefined);

export const getBalanceSheet = () =>
  safeInvoke<any>("get_balance_sheet", {}, {
    assets: [
      { code: "1010", name: "Cash", balanceCents: 50000 },
      { code: "1020", name: "Bank / Electronic", balanceCents: 390000 },
      { code: "1200", name: "Inventory Asset", balanceCents: 344000 }
    ],
    liabilities: [
      { code: "2000", name: "Accounts Payable", balanceCents: 85000 }
    ],
    equity: [
      { code: "3000", name: "Retained Earnings", balanceCents: 500000 },
      { code: "3100", name: "Current Net Profit (YTD)", balanceCents: 199000 }
    ],
    totalAssetsCents: 784000,
    totalLiabilitiesCents: 85000,
    totalEquityCents: 699000
  });

export const getProfitLoss = () =>
  safeInvoke<any>("get_profit_loss", {}, {
    revenues: [{ code: "4000", name: "Sales Revenue", balanceCents: 220500 }],
    expenses: [
      { code: "5000", name: "Cost of Goods Sold", balanceCents: 87000 },
      { code: "6100", name: "General Operations Expense", balanceCents: 3500 }
    ],
    totalRevenueCents: 220500,
    totalExpenseCents: 90500,
    netIncomeCents: 130000
  });


// HR & Payroll
export const getEmployees = () =>
  safeInvoke<any[]>("get_employees", {}, [
    { id: "emp-1", name: "Super User", baseSalaryCents: 500000, commissionRate: 0.0, status: "Active", payType: "Monthly", createdAt: new Date().toISOString() },
    { id: "emp-2", name: "Emily Watson", baseSalaryCents: 300000, commissionRate: 0.02, status: "Active", payType: "Monthly", createdAt: new Date().toISOString() }
  ]);

export const createEmployee = (input: any) =>
  safeInvoke<any>("create_employee", { input }, { id: "new-emp-id", ...input, status: "Active", createdAt: new Date().toISOString() });

export const updateEmployee = (id: string, name: string, email: string | null, phone: string | null, baseSalaryCents: number, commissionRate: number, payType: string, status: string) =>
  safeInvoke<void>("update_employee", { id, name, email, phone, baseSalaryCents, commissionRate, payType, status });

export const getAttendanceLogs = () =>
  safeInvoke<any[]>("get_attendance_logs", {}, []);

export const clockInOut = (employeeId: string) =>
  safeInvoke<string>("clock_in_out", { employeeId }, "Clocked In");

export const getCurrentAttendanceStatus = (employeeId: string) =>
  safeInvoke<boolean>("get_current_attendance_status", { employeeId }, false);

export const listPayrollRuns = () =>
  safeInvoke<any[]>("list_payroll_runs", {}, []);

export const generatePayrollRun = (employeeId: string, periodStart: string, periodEnd: string) =>
  safeInvoke<any>("generate_payroll_run", { employeeId, periodStart, periodEnd }, {
    id: "payroll-mock-id",
    employeeId,
    employeeName: "Emily Watson",
    periodStart,
    periodEnd,
    basePayCents: 300000,
    commissionPayCents: 5000,
    totalPayCents: 305000,
    status: "Draft",
    paidAt: null,
    createdAt: new Date().toISOString()
  });

export const payPayrollRun = (runId: string) =>
  safeInvoke<void>("pay_payroll_run", { runId });

export const runAutoPayroll = () =>
  safeInvoke<string | null>("run_auto_payroll", {}, null);






"use client";

import { useState, useEffect } from "react";
import PageContainer from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings, setSetting, resetStore, listSystemPrinters, getProducts, listInventoryMovements, getSuppliers, getUsers } from "@/lib/ipc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Save, Check, Printer, User, ShieldAlert, Cloud, CheckCircle2, AlertCircle, ArrowRight, Lock, Database, RefreshCw, Trash2, Settings2 } from "lucide-react";
import { useAuth } from "@/components/layout/app-layout";
import UserAccountsManager from "@/components/features/settings/user-accounts";
import { printPOSReceipt } from "@/lib/printer";
import { verifyLicenseKey } from "@/lib/syncEngine";
import { useAlerts } from "@/components/providers/alert-provider";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { logout, session } = useAuth();
  const role = session?.role || "Admin";
  const { showAlert, showConfirm, showPrompt } = useAlerts();

  const [activeTab, setActiveTab] = useState<"shop" | "users" | "receipt" | "sync">("shop");

  const { data: dbSettings = [], refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  // Shop settings states
  const [storeName, setStoreName] = useState("");
  const [currency, setCurrency] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [themeColor, setThemeColor] = useState("slate");
  const [productIdFormat, setProductIdFormat] = useState("sku_barcode");
  const [storeGstin, setStoreGstin] = useState("");
  const [idFormatChanged, setIdFormatChanged] = useState(false);

  // Receipt settings states
  const [receiptHeader, setReceiptHeader] = useState("StoreOS Kitchens");
  const [receiptSubtitle, setReceiptSubtitle] = useState("Home & Kitchen Retail Store");
  const [receiptWidth, setReceiptWidth] = useState("80mm");
  const [receiptShowDate, setReceiptShowDate] = useState("true");
  const [receiptShowRemarks, setReceiptShowRemarks] = useState("true");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for shopping!");
  const [receiptPrintMode, setReceiptPrintMode] = useState("html");

  // Supabase Sync settings states
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [supabaseSyncEnabled, setSupabaseSyncEnabled] = useState("false");
  const [licenseKey, setLicenseKey] = useState("");
  const [storeId, setStoreId] = useState("");

  // Supabase wizard step states
  const [syncStep, setSyncStep] = useState<1 | 2 | 3>(1);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Replication Checklist progress states
  const [syncProductsStatus, setSyncProductsStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMovementsStatus, setSyncMovementsStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncSuppliersStatus, setSyncSuppliersStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncUsersStatus, setSyncUsersStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [initialReplicationComplete, setInitialReplicationComplete] = useState(false);

  // Hardware printer states
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printers, setPrinters] = useState<string[]>([]);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    listSystemPrinters()
      .then((list) => {
        setPrinters(list);
      })
      .catch((err) => console.error("Failed to query hardware channels", err));
  }, []);

  useEffect(() => {
    if (dbSettings.length > 0) {
      const name = dbSettings.find((s) => s.key === "store_name")?.value || "";
      const cur = dbSettings.find((s) => s.key === "currency")?.value || "";
      const tax = dbSettings.find((s) => s.key === "tax_rate")?.value || "";
      const color = dbSettings.find((s) => s.key === "theme_color")?.value || "slate";
      const idFormat = dbSettings.find((s) => s.key === "product_id_format")?.value || "sku_barcode";
      const gstin = dbSettings.find((s) => s.key === "store_gstin")?.value || "";

      setStoreName(name);
      setCurrency(cur);
      setTaxRate(tax);
      setThemeColor(color);
      setProductIdFormat(idFormat);
      setStoreGstin(gstin);
      setIdFormatChanged(false);

      // Load receipt configuration
      const rHeader = dbSettings.find((s) => s.key === "receipt_header")?.value || "StoreOS Kitchens";
      const rSubtitle = dbSettings.find((s) => s.key === "receipt_subtitle")?.value || "Home & Kitchen Retail Store";
      const rWidth = dbSettings.find((s) => s.key === "receipt_width")?.value || "80mm";
      const rShowDate = dbSettings.find((s) => s.key === "receipt_show_date")?.value || "true";
      const rShowRemarks = dbSettings.find((s) => s.key === "receipt_show_remarks")?.value || "true";
      const rFooter = dbSettings.find((s) => s.key === "receipt_footer")?.value || "Thank you for shopping!";
      const rPrinter = dbSettings.find((s) => s.key === "receipt_default_printer")?.value || "";
      const rPrintMode = dbSettings.find((s) => s.key === "receipt_print_mode")?.value || "html";

      // Load Supabase Sync settings
      const sUrl = dbSettings.find((s) => s.key === "supabase_url")?.value || "";
      const sKey = dbSettings.find((s) => s.key === "supabase_key")?.value || "";
      const sEnabled = dbSettings.find((s) => s.key === "supabase_sync_enabled")?.value || "false";

      setReceiptHeader(rHeader);
      setReceiptSubtitle(rSubtitle);
      setReceiptWidth(rWidth);
      setReceiptShowDate(rShowDate);
      setReceiptShowRemarks(rShowRemarks);
      setReceiptFooter(rFooter);
      setSelectedPrinter(rPrinter);
      setReceiptPrintMode(rPrintMode);

      const sLicense = dbSettings.find((s) => s.key === "license_key")?.value || "";
      const sStoreId = dbSettings.find((s) => s.key === "store_id")?.value || "";

      setSupabaseUrl(sUrl);
      setSupabaseKey(sKey);
      setSupabaseSyncEnabled(sEnabled);
      setLicenseKey(sLicense);
      setStoreId(sStoreId);
    }
  }, [dbSettings]);

  const handleIdFormatChange = (val: string) => {
    setProductIdFormat(val);
    const originalFormat = dbSettings.find((s) => s.key === "product_id_format")?.value || "sku_barcode";
    if (val !== originalFormat) {
      setIdFormatChanged(true);
    } else {
      setIdFormatChanged(false);
    }
  };

  const testSupabaseConnection = async () => {
    if (!navigator.onLine) {
      setTestError("Activation requires an active internet connection. Please connect to WiFi/Ethernet.");
      return;
    }
    if (!licenseKey) {
      setTestError("Please enter a License Key.");
      return;
    }
    setIsTestingConnection(true);
    setTestError(null);
    try {
      const result = await verifyLicenseKey(licenseKey);
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const newStoreId = result.storeId || "default_store";
      setStoreId(newStoreId);
      
      // Save credentials & generated store ID
      const centralUrl = "https://ggyluxjrstdjavyagepq.supabase.co";
      const centralKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdneWx1eGpyc3RkamF2eWFnZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDUyMzIsImV4cCI6MjA5OTMyMTIzMn0.0mePcosWOEDdj_g5W2eZ8BGldv4TCPhYEX5Wlj_ofHM";

      await setSetting("license_key", licenseKey.trim());
      await setSetting("store_id", newStoreId);
      await setSetting("supabase_url", centralUrl);
      await setSetting("supabase_key", centralKey);
      setSupabaseUrl(centralUrl);
      setSupabaseKey(centralKey);
      
      // Proceed to Step 2
      setSyncStep(2);
    } catch (err: any) {
      setTestError(err.message || "Failed to verify license key. Please check format (SOS-XXXX-XXXX-XXXX).");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const runInitialReplication = async () => {
    setSyncProductsStatus("syncing");
    setSyncMovementsStatus("idle");
    setSyncSuppliersStatus("idle");
    setSyncUsersStatus("idle");
    setInitialReplicationComplete(false);
    
    try {
      const centralUrl = "https://ggyluxjrstdjavyagepq.supabase.co";
      const centralKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdneWx1eGpyc3RkamF2eWFnZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDUyMzIsImV4cCI6MjA5OTMyMTIzMn0.0mePcosWOEDdj_g5W2eZ8BGldv4TCPhYEX5Wlj_ofHM";

      await setSetting("supabase_sync_enabled", "true");
      setSupabaseSyncEnabled("true");
      await setSetting("last_sync_time", "1970-01-01T00:00:00.000Z");

      const products = await getProducts();
      if (products.length > 0) {
        const endpoint = `${centralUrl}/rest/v1/products`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "apikey": centralKey,
            "Authorization": `Bearer ${centralKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(products.map(p => ({
            id: p.id,
            store_id: storeId,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode || null,
            description: p.description || null,
            price_cents: p.priceCents,
            cost_cents: p.costCents,
            category: p.category || null,
            brand: p.brand || null,
            image_url: p.imageUrl || null,
            created_at: p.createdAt,
            updated_at: p.updatedAt
          })))
        });
        if (!res.ok) throw new Error(`Products sync failed: ${res.status}`);
      }
      setSyncProductsStatus("success");

      setSyncMovementsStatus("syncing");
      const movements = await listInventoryMovements();
      if (movements.length > 0) {
        const endpoint = `${centralUrl}/rest/v1/inventory_movements`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "apikey": centralKey,
            "Authorization": `Bearer ${centralKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(movements.map(m => ({
            id: m.id,
            store_id: storeId,
            product_id: m.productId,
            quantity: m.quantity,
            movement_type: m.movementType,
            reference_type: m.referenceType || null,
            reference_id: m.referenceId || null,
            employee_id: m.employeeId || null,
            timestamp: m.timestamp
          })))
        });
        if (!res.ok) throw new Error(`Movements sync failed: ${res.status}`);
      }
      setSyncMovementsStatus("success");

      setSyncSuppliersStatus("syncing");
      const suppliers = await getSuppliers();
      if (suppliers.length > 0) {
        const endpoint = `${centralUrl}/rest/v1/suppliers`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "apikey": centralKey,
            "Authorization": `Bearer ${centralKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(suppliers.map(s => ({
            id: s.id,
            store_id: storeId,
            name: s.name,
            contact_name: s.contactName || null,
            email: s.email || null,
            phone: s.phone || null,
            created_at: s.createdAt
          })))
        });
        if (!res.ok) throw new Error(`Suppliers sync failed: ${res.status}`);
      }
      setSyncSuppliersStatus("success");

      setSyncUsersStatus("syncing");
      const users = await getUsers();
      if (users.length > 0) {
        const endpoint = `${centralUrl}/rest/v1/users`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "apikey": centralKey,
            "Authorization": `Bearer ${centralKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify(users.map(u => ({
            id: u.id,
            store_id: storeId,
            username: u.username,
            pin: u.pin,
            role: u.role,
            created_at: u.createdAt
          })))
        });
        if (!res.ok) throw new Error(`Users sync failed: ${res.status}`);
      }
      setSyncUsersStatus("success");

      await setSetting("last_sync_time", new Date().toISOString());
      await setSetting("sync_status", "Synced");
      
      setInitialReplicationComplete(true);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err: any) {
      console.error(err);
      setSyncProductsStatus("error");
      setSyncMovementsStatus("error");
      setSyncSuppliersStatus("error");
      setSyncUsersStatus("error");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (activeTab === "shop") {
        await setSetting("store_name", storeName);
        await setSetting("currency", currency);
        await setSetting("tax_rate", taxRate);
        await setSetting("theme_color", themeColor);
        await setSetting("product_id_format", productIdFormat);
        await setSetting("store_gstin", storeGstin);
      } else if (activeTab === "receipt") {
        await setSetting("receipt_header", receiptHeader);
        await setSetting("receipt_subtitle", receiptSubtitle);
        await setSetting("receipt_width", receiptWidth);
        await setSetting("receipt_show_date", receiptShowDate);
        await setSetting("receipt_show_remarks", receiptShowRemarks);
        await setSetting("receipt_footer", receiptFooter);
        await setSetting("receipt_default_printer", selectedPrinter);
        await setSetting("receipt_print_mode", receiptPrintMode);
      } else if (activeTab === "sync") {
        await setSetting("supabase_url", supabaseUrl);
        await setSetting("supabase_key", supabaseKey);
        await setSetting("supabase_sync_enabled", supabaseSyncEnabled);
      }
      
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setIdFormatChanged(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const pin = await showPrompt(
      "This action is restricted to developer override. Please enter the Developer Reset PIN (Contact MrFluffycloud if you do not have it):",
      "Developer PIN Required"
    );
    if (pin !== "9842") {
      await showAlert(
        "Access Denied: Invalid Developer Reset PIN. Please contact MrFluffycloud for the authorization code.",
        "Access Denied",
        "error"
      );
      return;
    }

    const confirm1 = await showConfirm(
      "⚠️ DANGER ZONE: Are you sure you want to delete this store?\n\n" +
      "This will permanently delete all products, sales history, inventory logs, and reset all onboarding styles. This action cannot be undone.",
      "Dangerous Action"
    );
    if (!confirm1) return;

    const confirm2 = await showPrompt(
      "To confirm deletion, please type 'RESET STORE' in the box below:",
      "Confirmation Required"
    );
    if (confirm2 !== "RESET STORE") {
      await showAlert("Reset aborted. The input did not match 'RESET STORE'.", "Aborted", "warning");
      return;
    }

    setResetting(true);
    try {
      await resetStore();
      
      // Invalidate queries to clear cache state
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });

      await showAlert("Store has been successfully deleted. You will now be logged out to restart the setup.", "Store Deleted", "info");
      logout();
    } catch (err) {
      console.error("Failed to delete store database", err);
      await showAlert("Failed to delete store. See logs.", "Deletion Failed", "error");
    } finally {
      setResetting(false);
    }
  };

  // Cashiers are blocked from modifying shop settings
  const isReadOnly = role === "Cashier" || role === "Auditor";

  if (activeTab === "users" && role !== "Admin") {
    return (
      <PageContainer title="Settings" subtitle="User Accounts & Roles">
        <div className="flex flex-col items-center justify-center py-16 text-center select-none">
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Access Restricted</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Only owners and administrators can manage user login accounts and access levels.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Settings"
      subtitle="Configure local ERP parameters, tax rules, and receipt printer customizers"
    >
      <div className="space-y-6">
        {/* Tab Headers */}
        <div className="flex border-b border-border/60 gap-6 select-none">
          <button
            onClick={() => setActiveTab("shop")}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "shop"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Shop Configuration
          </button>
          <button
            onClick={() => setActiveTab("receipt")}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "receipt"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Receipt Customizer
          </button>
          {role === "Admin" && (
            <button
              onClick={() => setActiveTab("users")}
              className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === "users"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              User Accounts & Roles
            </button>
          )}
          <button
            onClick={() => setActiveTab("sync")}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "sync"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Cloud Sync
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "shop" ? (
          <div className="max-w-2xl space-y-6">
            <Card className="border border-border bg-card shadow-sm select-none">
              <CardHeader className="border-b border-border/55 pb-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Retail Shop Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="storeName" className="text-xs font-semibold text-foreground">Store Name</Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="e.g. StoreOS Home & Kitchen"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency" className="text-xs font-semibold text-foreground">Currency Code</Label>
                      <select
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        disabled={isReadOnly}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-mono"
                      >
                        <option value="USD">USD ($ - United States Dollar)</option>
                        <option value="EUR">EUR (€ - Euro)</option>
                        <option value="GBP">GBP (£ - British Pound)</option>
                        <option value="INR">INR (₹ - Indian Rupee)</option>
                        <option value="CAD">CAD ($ - Canadian Dollar)</option>
                        <option value="AUD">AUD ($ - Australian Dollar)</option>
                        <option value="JPY">JPY (¥ - Japanese Yen)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="taxRate" className="text-xs font-semibold text-foreground">Tax Rate (decimal)</Label>
                      <Input
                        id="taxRate"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        disabled={isReadOnly}
                        placeholder="e.g. 0.0825 (for 8.25%)"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* ID format picker & GSTIN */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                    <div className="space-y-2.5">
                      <Label htmlFor="productIdFormat" className="text-xs font-semibold text-foreground">Product Identifier Format</Label>
                      <select
                        id="productIdFormat"
                        value={productIdFormat}
                        onChange={(e) => handleIdFormatChange(e.target.value)}
                        disabled={isReadOnly}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      >
                        <option value="sku_barcode">SKU + Barcode (UPC)</option>
                        <option value="sku_serial">SKU + Serial Number</option>
                      </select>
                      {idFormatChanged && (
                        <div className="text-[10px] text-amber-500 font-semibold leading-normal mt-1.5 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                          ⚠️ Warning: Changing tracking formats with existing catalog items can make barcode scans fail or misalign serial numbers on previous checkouts.
                        </div>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      <Label htmlFor="storeGstin" className="text-xs font-semibold text-foreground">Store GSTIN (Optional)</Label>
                      <Input
                        id="storeGstin"
                        value={storeGstin}
                        onChange={(e) => setStoreGstin(e.target.value)}
                        disabled={isReadOnly}
                        placeholder="e.g. 27AAAAA1111A1Z1"
                        className="h-9 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>

                  {/* Accent Color Picker */}
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <Label className="text-xs font-semibold text-foreground">Primary Accent Theme Color</Label>
                    <div className="flex gap-3.5">
                      {[
                        { name: "slate", colorClass: "bg-slate-500" },
                        { name: "violet", colorClass: "bg-violet-500" },
                        { name: "emerald", colorClass: "bg-emerald-500" },
                        { name: "rose", colorClass: "bg-rose-500" },
                        { name: "amber", colorClass: "bg-amber-500" },
                      ].map((color) => (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => !isReadOnly && setThemeColor(color.name)}
                          disabled={isReadOnly}
                          className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                            themeColor === color.name
                              ? "border-foreground scale-110 shadow"
                              : "border-transparent hover:scale-105"
                          }`}
                          title={color.name.charAt(0).toUpperCase() + color.name.slice(1)}
                        >
                          <span className={`w-6 h-6 rounded-full ${color.colorClass}`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                      <Button type="submit" size="sm" className="h-8.5 text-xs font-semibold flex items-center gap-1.5" disabled={saving}>
                        {saved ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            Saved
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            Save Settings
                          </>
                        )}
                      </Button>
                      {saved && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Settings written to local SQLite database!
                        </span>
                      )}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>

            {/* Danger Zone Reset Module */}
            {role === "Admin" && (
              <Card className="border border-destructive/20 bg-destructive/5 select-none">
                <CardHeader className="border-b border-destructive/20 pb-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-destructive flex items-center gap-2">
                    ⚠️ Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col space-y-1">
                      <span className="text-xs font-bold text-foreground">Delete Store & Reset ERP</span>
                      <span className="text-[10px] text-muted-foreground leading-normal max-w-md">
                        Wipe all products, inventories, logs, and custom styles to start fresh. You will be logged out to complete the onboarding wizard.
                      </span>
                    </div>
                    <Button
                      type="button"
                      onClick={handleReset}
                      disabled={resetting}
                      className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs h-8.5 shrink-0"
                    >
                      {resetting ? "Resetting..." : "Reset Store Environment"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : activeTab === "receipt" ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Receipt Form Control panel */}
            <div className="lg:col-span-3 space-y-6">
              <Card className="border border-border bg-card shadow-sm select-none">
                <CardHeader className="border-b border-border/55 pb-4">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Printer className="w-4 h-4 text-primary" /> Receipt Print Template Layout
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="rHeader" className="text-xs font-semibold text-foreground">Store Receipt Title</Label>
                      <Input
                        id="rHeader"
                        value={receiptHeader}
                        onChange={(e) => setReceiptHeader(e.target.value)}
                        disabled={isReadOnly}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rSubtitle" className="text-xs font-semibold text-foreground">Header Subtitle Address</Label>
                      <Input
                        id="rSubtitle"
                        value={receiptSubtitle}
                        onChange={(e) => setReceiptSubtitle(e.target.value)}
                        disabled={isReadOnly}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rWidth" className="text-xs font-semibold text-foreground">Paper Page Width</Label>
                        <select
                          id="rWidth"
                          value={receiptWidth}
                          onChange={(e) => setReceiptWidth(e.target.value)}
                          disabled={isReadOnly}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:ring-1 focus:ring-primary text-foreground"
                        >
                          <option value="80mm">80mm Thermal (Standard)</option>
                          <option value="58mm">58mm Thermal (Narrow)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-foreground">Print Options</Label>
                        <div className="flex gap-4 pt-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={receiptShowDate === "true"}
                              disabled={isReadOnly}
                              onChange={(e) => setReceiptShowDate(e.target.checked ? "true" : "false")}
                              className="rounded border-border"
                            />
                            Date/Time
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={receiptShowRemarks === "true"}
                              disabled={isReadOnly}
                              onChange={(e) => setReceiptShowRemarks(e.target.checked ? "true" : "false")}
                              className="rounded border-border"
                            />
                            Remarks
                          </label>
                        </div>
                      </div>
                    </div>

                     <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rFooter" className="text-xs font-semibold text-foreground">Receipt Footer Notes</Label>
                        <Input
                          id="rFooter"
                          value={receiptFooter}
                          onChange={(e) => setReceiptFooter(e.target.value)}
                          disabled={isReadOnly}
                          className="h-9 text-xs"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="rPrinter" className="text-xs font-semibold text-foreground">Hardware Print Destination</Label>
                        <select
                          id="rPrinter"
                          value={selectedPrinter}
                          onChange={(e) => setSelectedPrinter(e.target.value)}
                          disabled={isReadOnly}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:ring-1 focus:ring-primary text-foreground"
                        >
                          <option value="">-- Use Default System Dialog --</option>
                          {printers.map((p, idx) => (
                            <option key={idx} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="rPrintMode" className="text-xs font-semibold text-foreground">Silent Printing Engine</Label>
                        <select
                          id="rPrintMode"
                          value={receiptPrintMode}
                          onChange={(e) => setReceiptPrintMode(e.target.value)}
                          disabled={isReadOnly}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:ring-1 focus:ring-primary text-foreground"
                        >
                          <option value="html">HTML Graphics Direct (Accurate Alignment)</option>
                          <option value="raw">Raw Spooling (Instant POS Text - Speed Recommended)</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Choose HTML Graphics for full invoice layouts. Choose Raw Spooling for lightning-fast thermal POS receipt prints.
                        </p>
                      </div>
                    </div>

                    {!isReadOnly && (
                      <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                        <Button type="submit" size="sm" className="h-8.5 text-xs font-semibold flex items-center gap-1.5" disabled={saving}>
                          {saved ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              Layout Saved
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5" />
                              Save Custom Layout
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8.5 text-xs font-semibold flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => {
                            printPOSReceipt(
                              {
                                receiptId: "TEST-9999",
                                timestamp: new Date().toISOString(),
                                customerName: "General Customer (Test)",
                                items: [
                                  {
                                    product: {
                                      id: "test-p1",
                                      name: "Cast Iron Skillet (Test)",
                                      sku: "HK-CIS-12",
                                      barcode: "",
                                      description: "",
                                      priceCents: 4999,
                                      costCents: 2200,
                                      brand: "StoreOS",
                                      imageUrl: "",
                                      category: "Cookware",
                                      createdAt: new Date().toISOString(),
                                      updatedAt: new Date().toISOString(),
                                    },
                                    qty: 1,
                                  },
                                ],
                                subtotalCents: 4999,
                                discountCents: 0,
                                taxCents: 412,
                                totalCents: 5411,
                                paymentMethod: "cash",
                                cashReceivedCents: 6000,
                                changeDueCents: 589,
                                remarksText: "Hardware Print Verification Test Successful!",
                              },
                              {
                                header: receiptHeader,
                                subtitle: receiptSubtitle,
                                width: receiptWidth as "80mm" | "58mm",
                                showDate: receiptShowDate === "true",
                                showRemarks: receiptShowRemarks === "true",
                                footer: receiptFooter,
                                defaultPrinter: selectedPrinter,
                                printMode: receiptPrintMode,
                              }
                            );
                          }}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Send Test Print
                        </Button>

                        {saved && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Receipt layout updated!
                          </span>
                        )}
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Receipt Preview panel */}
            <div className="lg:col-span-2 space-y-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block text-center">
                Live Printer Roll Preview
              </span>

              {/* simulated receipt roll */}
              <div className="flex justify-center bg-zinc-950 p-6 rounded-xl border border-border/40 select-none">
                <div
                  style={{ width: receiptWidth === "58mm" ? "240px" : "320px" }}
                  className="bg-white text-zinc-950 shadow-2xl p-3 font-mono text-[8px] leading-tight space-y-3 transition-all duration-300 border-t-4 border-black"
                >
                  {/* Shop header */}
                  <div className="text-center space-y-0.5">
                    <h3 className="font-bold text-xs uppercase leading-tight text-zinc-950">{receiptHeader}</h3>
                    <p className="text-[7.5px] text-zinc-600 font-sans leading-none">{receiptSubtitle}</p>
                  </div>

                  {/* Meta block */}
                  <div className="flex justify-between text-[7.5px] border-b border-zinc-200 pb-1.5 mt-2">
                    <div className="flex flex-col gap-0.5">
                      <div><span className="font-bold">Bill No:</span> REC-1515</div>
                      <div><span className="font-bold">To:</span> Rahul (Sample Customer)</div>
                    </div>
                    <div className="flex flex-col gap-0.5 text-right">
                      {receiptShowDate === "true" && <div>3:47:17 PM</div>}
                      {receiptShowDate === "true" && <div><span className="font-bold">Date:</span> 21-Sep-2025</div>}
                      <div><span className="font-bold">Operator:</span> MHC</div>
                    </div>
                  </div>

                  {/* Grid Table */}
                  <table className="w-full border-collapse border border-zinc-950 text-[7px] mt-2">
                    <thead>
                      <tr className="bg-zinc-100 font-bold border-b border-zinc-950">
                        <th className="border-r border-zinc-950 p-1 text-center">Sl</th>
                        <th className="border-r border-zinc-950 p-1 text-center">Code</th>
                        <th className="border-r border-zinc-950 p-1 text-left">Particulars</th>
                        <th className="border-r border-zinc-950 p-1 text-center">Disc%</th>
                        <th className="border-r border-zinc-950 p-1 text-center">Qty</th>
                        <th className="border-r border-zinc-950 p-1 text-right">Rate</th>
                        <th className="p-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-zinc-200">
                        <td className="border-r border-zinc-950 p-1 text-center">1</td>
                        <td className="border-r border-zinc-950 p-1 text-center font-bold">4456</td>
                        <td className="border-r border-zinc-950 p-1">SUPER WOOD CUTTING BOARD 8 INCH</td>
                        <td className="border-r border-zinc-950 p-1 text-center">0</td>
                        <td className="border-r border-zinc-950 p-1 text-center font-bold">1 PCs</td>
                        <td className="border-r border-zinc-950 p-1 text-right">225.00</td>
                        <td className="p-1 text-right font-bold">225.00</td>
                      </tr>
                      <tr className="border-b border-zinc-200">
                        <td className="border-r border-zinc-950 p-1 text-center">2</td>
                        <td className="border-r border-zinc-950 p-1 text-center font-bold">1684</td>
                        <td className="border-r border-zinc-950 p-1">LARAH 21PC DINNER SET</td>
                        <td className="border-r border-zinc-950 p-1 text-center">0</td>
                        <td className="border-r border-zinc-950 p-1 text-center font-bold">1 PCs</td>
                        <td className="border-r border-zinc-950 p-1 text-right">2790.00</td>
                        <td className="p-1 text-right font-bold">2790.00</td>
                      </tr>
                      {/* Empty spacer rows */}
                      {[3, 4, 5].map((num) => (
                        <tr key={num} className="opacity-40">
                          <td className="border-r border-zinc-950 p-1 text-center">{num}</td>
                          <td className="border-r border-zinc-950 p-1"></td>
                          <td className="border-r border-zinc-950 p-1"></td>
                          <td className="border-r border-zinc-950 p-1"></td>
                          <td className="border-r border-zinc-950 p-1"></td>
                          <td className="border-r border-zinc-950 p-1"></td>
                          <td className="p-1"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals Section */}
                  <div className="flex justify-end mt-2">
                    <table className="w-[50%] border-collapse border border-zinc-950 text-[7.5px]">
                      <tbody>
                        <tr className="border-b border-zinc-950">
                          <td className="p-1 font-bold text-right border-r border-zinc-950">Gross Amount</td>
                          <td className="p-1 text-right">3015.00</td>
                        </tr>
                        <tr className="border-b border-zinc-950">
                          <td className="p-1 font-bold text-right border-r border-zinc-950">Discount</td>
                          <td className="p-1 text-right">0.00</td>
                        </tr>
                        <tr className="bg-zinc-50 font-bold">
                          <td className="p-1 text-right border-r border-zinc-950">TOTAL:</td>
                          <td className="p-1 text-right">3015.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Remarks and Footer */}
                  <div className="text-center text-[7.5px] mt-3 space-y-1">
                    {receiptShowRemarks === "true" && (
                      <div className="italic text-zinc-500 border-t border-dotted border-zinc-300 pt-1">
                        Remarks: Sample POS Test Checkout
                      </div>
                    )}
                    <div className="font-bold uppercase tracking-wider text-zinc-900 border-t border-zinc-200 pt-1.5">
                      {receiptFooter}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === "users" ? (
          <UserAccountsManager />
        ) : activeTab === "sync" ? (
          <div className="max-w-2xl space-y-6 select-none">
            {supabaseSyncEnabled === "true" ? (
              /* Connected Dashboard View */
              <div className="space-y-6">
                <Card className="border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-emerald-500 animate-pulse" /> Cloud Sync Active
                      </CardTitle>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        🟢 Connected
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      StoreOS is connected to your cloud database. Local checkouts, products, and movements are synced automatically in real-time.
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2 pb-6 space-y-4">
                    <div className="space-y-2 border-t border-border/40 pt-4 text-xs">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground font-medium">License Key:</span>
                        <span className="font-mono text-[11px] text-foreground font-semibold">
                          SOS-••••-••••-{licenseKey ? licenseKey.slice(-4) : "8162"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-t border-border/20">
                        <span className="text-muted-foreground font-medium">Store ID / Tenant:</span>
                        <span className="font-mono text-[11px] text-foreground font-semibold">{storeId || "default_store"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-t border-border/20">
                        <span className="text-muted-foreground font-medium">Status:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Premium Active</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
                        onClick={async () => {
                          // Allow reconfiguring connection
                          setSyncStep(1);
                          setSupabaseSyncEnabled("false");
                        }}
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Reconfigure
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
                        onClick={async () => {
                          const confirmSync = await showConfirm("Are you sure you want to disconnect Cloud Sync? Local changes will no longer replicate to Supabase.", "Disconnect Cloud Sync");
                          if (confirmSync) {
                            await setSetting("supabase_sync_enabled", "false");
                            setSupabaseSyncEnabled("false");
                            refetch();
                            queryClient.invalidateQueries({ queryKey: ["settings"] });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Disconnect Sync
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* Setup Progressive Stepper Flow */
              <div className="space-y-6">
                {/* Stepper Headers */}
                <div className="grid grid-cols-2 gap-2 pb-2">
                  <div className={`text-center pb-2 border-b-2 transition-all ${syncStep === 1 ? "border-primary text-foreground font-semibold" : syncStep > 1 ? "border-emerald-500 text-emerald-500" : "border-muted text-muted-foreground"}`}>
                    <div className="text-[10px] uppercase font-bold tracking-wider">Step 1</div>
                    <div className="text-[11px] truncate mt-0.5 font-semibold">Activate License</div>
                  </div>
                  <div className={`text-center pb-2 border-b-2 transition-all ${syncStep === 2 ? "border-primary text-foreground font-semibold" : "border-muted text-muted-foreground"}`}>
                    <div className="text-[10px] uppercase font-bold tracking-wider">Step 2</div>
                    <div className="text-[11px] truncate mt-0.5 font-semibold">Push All Data</div>
                  </div>
                </div>

                {/* Step 1: License Key Activation */}
                {syncStep === 1 && (
                  <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Lock className="w-4 h-4 text-primary" /> 1. Enter Premium License Key
                      </CardTitle>
                      <div className="text-xs text-muted-foreground mt-1">
                        Enter your premium StoreOS License Key to authenticate and activate real-time cloud replication.
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="licenseKey" className="text-xs font-semibold text-foreground">Premium License Key</Label>
                        <Input
                          id="licenseKey"
                          type="text"
                          placeholder="SOS-1234-5678-9012"
                          value={licenseKey}
                          onChange={(e) => setLicenseKey(e.target.value)}
                          className="h-9 text-xs font-mono uppercase tracking-wider font-semibold"
                          maxLength={18}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Format: SOS-XXXX-XXXX-XXXX (WiFi/Ethernet connection required)</p>
                      </div>

                      {testError && (
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{testError}</span>
                        </div>
                      )}

                      <div className="flex justify-end pt-4 border-t border-border/40">
                        <Button
                          type="button"
                          className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
                          disabled={isTestingConnection || !licenseKey}
                          onClick={testSupabaseConnection}
                        >
                          {isTestingConnection ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Verifying key...
                            </>
                          ) : (
                            <>
                              Verify & Activate <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Step 2: Initial Full Replication */}
                {syncStep === 2 && (
                  <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-primary" /> 2. Replicate Existing Data
                      </CardTitle>
                      <div className="text-xs text-muted-foreground mt-1">
                        Push all existing products, inventory movements, suppliers, and user accounts from your local SQLite database to Supabase.
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-2">
                      {/* Step Progress Checklist */}
                      <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/40 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">Products Database Table</span>
                          <span className="font-semibold font-mono">
                            {syncProductsStatus === "idle" && <span className="text-muted-foreground">Pending</span>}
                            {syncProductsStatus === "syncing" && <span className="text-blue-500 animate-pulse flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Uploading...</span>}
                            {syncProductsStatus === "success" && <span className="text-emerald-500 flex items-center gap-1">✓ Complete</span>}
                            {syncProductsStatus === "error" && <span className="text-rose-500 font-bold">✗ Failed</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/20 pt-3">
                          <span className="font-medium text-foreground">Inventory Movements Logs</span>
                          <span className="font-semibold font-mono">
                            {syncMovementsStatus === "idle" && <span className="text-muted-foreground">Pending</span>}
                            {syncMovementsStatus === "syncing" && <span className="text-blue-500 animate-pulse flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Uploading...</span>}
                            {syncMovementsStatus === "success" && <span className="text-emerald-500 flex items-center gap-1">✓ Complete</span>}
                            {syncMovementsStatus === "error" && <span className="text-rose-500 font-bold">✗ Failed</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/20 pt-3">
                          <span className="font-medium text-foreground">Suppliers Catalog</span>
                          <span className="font-semibold font-mono">
                            {syncSuppliersStatus === "idle" && <span className="text-muted-foreground">Pending</span>}
                            {syncSuppliersStatus === "syncing" && <span className="text-blue-500 animate-pulse flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Uploading...</span>}
                            {syncSuppliersStatus === "success" && <span className="text-emerald-500 flex items-center gap-1">✓ Complete</span>}
                            {syncSuppliersStatus === "error" && <span className="text-rose-500 font-bold">✗ Failed</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border/20 pt-3">
                          <span className="font-medium text-foreground">User Accounts & Roles</span>
                          <span className="font-semibold font-mono">
                            {syncUsersStatus === "idle" && <span className="text-muted-foreground">Pending</span>}
                            {syncUsersStatus === "syncing" && <span className="text-blue-500 animate-pulse flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Uploading...</span>}
                            {syncUsersStatus === "success" && <span className="text-emerald-500 flex items-center gap-1">✓ Complete</span>}
                            {syncUsersStatus === "error" && <span className="text-rose-500 font-bold">✗ Failed</span>}
                          </span>
                        </div>
                      </div>

                      {initialReplicationComplete && (
                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex gap-2.5 items-start">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                          <div className="space-y-1">
                            <p className="font-bold">Cloud Sync Setup Completed Successfully!</p>
                            <p className="text-[11px] text-muted-foreground">All local SQLite data has been synchronized to the cloud. StoreOS is now operating with live cloud backup.</p>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between pt-4 border-t border-border/40">
                        <Button
                          variant="ghost"
                          type="button"
                          className="h-8.5 text-xs font-semibold"
                          disabled={syncProductsStatus === "syncing" || syncMovementsStatus === "syncing" || syncSuppliersStatus === "syncing" || syncUsersStatus === "syncing" || initialReplicationComplete}
                          onClick={() => setSyncStep(1)}
                        >
                          Back
                        </Button>

                        {initialReplicationComplete ? (
                          <Button
                            type="button"
                            className="h-8.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={() => {
                              refetch();
                              queryClient.invalidateQueries({ queryKey: ["settings"] });
                            }}
                          >
                            Setup Completed, Go to Dashboard
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
                            disabled={syncProductsStatus === "syncing" || syncMovementsStatus === "syncing" || syncSuppliersStatus === "syncing" || syncUsersStatus === "syncing"}
                            onClick={runInitialReplication}
                          >
                            Start Replication & Connect
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}

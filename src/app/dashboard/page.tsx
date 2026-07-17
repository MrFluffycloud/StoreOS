"use client";

import { useState, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProducts,
  listInventoryMovements,
  getInventorySummary,
  getSettings,
  syncDatabase,
  getSystemHealth,
  checkForUpdateInfo,
  installAndRestartUpdate,
} from "@/lib/ipc";
import { performDatabaseSync } from "@/lib/syncEngine";
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  AlertCircle,
  Info,
  History,
  Activity,
  Package,
  RefreshCw,
  Cpu,
  Database,
  HardDrive,
  Users,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  Download,
} from "lucide-react";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);

  // Updater states
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; version: string; body?: string } | null>(null);
  const [updateStatusText, setUpdateStatusText] = useState("Idle");

  const runUpdateCheck = async (interactive = false) => {
    setCheckingUpdate(true);
    setUpdateStatusText("Checking for updates...");
    try {
      const info = await checkForUpdateInfo();
      if (info) {
        setUpdateInfo(info);
        if (info.available) {
          setUpdateStatusText(`New version available: v${info.version}`);
        } else {
          setUpdateStatusText("Application is up to date");
        }
      } else {
        setUpdateStatusText("Failed to check for updates");
      }
    } catch (err) {
      console.error(err);
      setUpdateStatusText("Error checking updates");
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    runUpdateCheck(false);
  }, []);


  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const goOnline = () => setIsOnline(true);
      const goOffline = () => setIsOnline(false);
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      };
    }
  }, []);

  // Queries
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  const { data: summary = [], isLoading: loadingSummary } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: getInventorySummary,
  });

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: health } = useQuery({
    queryKey: ["systemHealth"],
    queryFn: getSystemHealth,
    refetchInterval: 30000, // refresh every 30s
  });

  const isLoading = loadingProducts || loadingMovements || loadingSummary;

  // Sync settings
  const syncEnabled = dbSettings.find((s) => s.key === "supabase_sync_enabled")?.value === "true";
  const syncStatus = dbSettings.find((s) => s.key === "sync_status")?.value || "Synced";
  const lastSyncTime = dbSettings.find((s) => s.key === "last_sync_time")?.value || "Never";
  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";

  const syncMutation = useMutation({
    mutationFn: async () => {
      await performDatabaseSync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  // Calculate Metrics from database
  const totalRevenueCents = movements
    .filter((m) => m.movementType === "Sale")
    .reduce((acc, m) => {
      const prod = products.find((p) => p.id === m.productId);
      if (prod) {
        return acc + prod.priceCents * Math.abs(m.quantity);
      }
      return acc;
    }, 0);

  const formattedRevenue = (totalRevenueCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency,
  });

  // Net Profit
  const totalProfitCents = movements
    .filter((m) => m.movementType === "Sale")
    .reduce((acc, m) => {
      const prod = products.find((p) => p.id === m.productId);
      if (prod) {
        const margin = prod.priceCents - prod.costCents;
        return acc + margin * Math.abs(m.quantity);
      }
      return acc;
    }, 0);

  const formattedProfit = (totalProfitCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency,
  });

  // Unique transaction checkouts count
  const transactionCount = new Set(
    movements.filter((m) => m.movementType === "Sale").map((m) => m.referenceId)
  ).size;

  // Actual profit margin percentage calculation
  const marginPercentage = totalRevenueCents > 0 ? (totalProfitCents / totalRevenueCents) * 100 : 0;

  // Low stock is defined as < 25 items left
  const lowStockCount = summary.filter((s) => s.currentStock < 25).length;
  const totalSkuCount = products.length;

  const formatLastSync = (timestamp: string) => {
    if (timestamp === "Never") return "Never";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timestamp;
    }
  };

  // Recent Movements table columns configuration
  const columns = [
    {
      header: "Timestamp",
      sortValue: (m: any) => new Date(m.timestamp).getTime(),
      accessor: (m: any) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(m.timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ),
    },
    {
      header: "Product",
      sortValue: (m: any) => {
        const prod = products.find((p) => p.id === m.productId);
        return prod ? prod.name : m.productId;
      },
      accessor: (m: any) => {
        const prod = products.find((p) => p.id === m.productId);
        return (
          <div className="flex flex-col">
            <span className="font-medium text-xs text-foreground">
              {prod ? prod.name : "Unknown Product"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
              SKU: {prod ? prod.sku : m.productId}
            </span>
          </div>
        );
      },
    },
    {
      header: "Activity Type",
      sortValue: (m: any) => m.movementType,
      accessor: (m: any) => {
        let badgeColor = "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
        if (m.movementType === "Purchase") badgeColor = "bg-sky-500/10 text-sky-600 dark:text-sky-400";
        if (m.movementType === "Sale") badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
        if (m.movementType === "Damage") badgeColor = "bg-rose-500/10 text-rose-600 dark:text-rose-400";

        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${badgeColor}`}>
            {m.movementType}
          </span>
        );
      },
    },
    {
      header: "Quantity",
      sortValue: (m: any) => m.quantity,
      accessor: (m: any) => {
        const isPositive = m.quantity > 0;
        return (
          <span
            className={`font-mono text-xs font-semibold ${
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {m.quantity}
          </span>
        );
      },
      className: "text-right",
    },
    {
      header: "Reference",
      sortValue: (m: any) => m.referenceId || "",
      accessor: (m: any) => (
        <span className="text-xs text-muted-foreground font-mono">
          {m.referenceId || "N/A"}
        </span>
      ),
      className: "text-right",
    },
  ];

  // Compute Smart Alerts
  const alerts: { type: "info" | "warning" | "error"; title: string; desc: string }[] = [];

  // 1. Low Stock (Stock <= 10)
  summary.forEach((s) => {
    if (s.currentStock <= 10) {
      alerts.push({
        type: "error",
        title: `Low Stock: ${s.productName}`,
        desc: `Only ${s.currentStock} units left (SKU: ${s.sku}). Reorder soon.`,
      });
    }
  });

  // 2. High Return Rates (> 15% return-to-sales ratio)
  const productSalesQty = new Map<string, number>();
  const productReturnsQty = new Map<string, number>();

  movements.forEach((m) => {
    if (m.movementType === "Sale") {
      productSalesQty.set(m.productId, (productSalesQty.get(m.productId) || 0) + Math.abs(m.quantity));
    } else if (m.movementType === "SalesReturn") {
      productReturnsQty.set(m.productId, (productReturnsQty.get(m.productId) || 0) + Math.abs(m.quantity));
    }
  });

  products.forEach((p) => {
    const sales = productSalesQty.get(p.id) || 0;
    const returns = productReturnsQty.get(p.id) || 0;
    if (sales > 0) {
      const returnRate = (returns / sales) * 100;
      if (returnRate > 15) {
        alerts.push({
          type: "warning",
          title: `High Returns: ${p.name}`,
          desc: `${returnRate.toFixed(0)}% return rate (${returns} returned / ${sales} sold).`,
        });
      }
    }
  });

  // 3. Stagnant Stock (No sales in last 30 days)
  const salesLast30Days = new Set<string>();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  movements.forEach((m) => {
    if (m.movementType === "Sale") {
      const date = new Date(m.timestamp);
      if (date >= thirtyDaysAgo) {
        salesLast30Days.add(m.productId);
      }
    }
  });

  products.forEach((p) => {
    if (!salesLast30Days.has(p.id)) {
      const createdDate = new Date(p.createdAt);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      // Ensure product isn't brand new
      if (createdDate <= sevenDaysAgo) {
        alerts.push({
          type: "info",
          title: `Stagnant Item: ${p.name}`,
          desc: `No sales in the last 30 days (SKU: ${p.sku}).`,
        });
      }
    }
  });

  if (isLoading) {
    return (
      <PageContainer title="Dashboard" subtitle="Overview of store performance">
        {/* Metric Cards Skeleton */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 select-none">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border border-border p-6 flex flex-col justify-between h-28">
              <div className="flex justify-between items-center w-full">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            </Card>
          ))}
        </div>

        {/* Charts & Status Section Skeleton */}
        <div className="grid gap-6 md:grid-cols-6 mt-8">
          {/* Main Chart Column */}
          <Card className="col-span-4 bg-card border border-border p-6 flex flex-col justify-between h-96">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            {/* Chart mock bars */}
            <div className="h-56 w-full flex items-end justify-between gap-4 px-2 mt-4">
              {[...Array(12)].map((_, j) => {
                const heights = ["h-12", "h-24", "h-36", "h-16", "h-28", "h-40", "h-20", "h-32", "h-44", "h-14", "h-30", "h-48"];
                return <Skeleton key={j} className={`flex-1 rounded-t ${heights[j % heights.length]}`} />;
              })}
            </div>
            <div className="flex justify-between w-full mt-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
            </div>
          </Card>

          {/* Sidebar / Recent Actions Column */}
          <Card className="col-span-2 bg-card border border-border p-6 flex flex-col justify-between h-96">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="space-y-4 my-4 flex-1 justify-center flex flex-col">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="h-8 w-full rounded" />
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Dashboard"
      subtitle="Overview of store performance"
      actions={
        <div className="flex items-center gap-3 select-none">
          {/* Cloud Sync Status Indicator — only if enabled */}
          {syncEnabled && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5 font-mono">
              {syncStatus === "Synced" ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              ) : syncStatus === "Syncing" ? (
                <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              ) : syncStatus.includes("Offline") ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span>
                Cloud Sync: <span className="font-semibold text-foreground">{syncStatus}</span>
                {lastSyncTime !== "Never" && ` (Last: ${formatLastSync(lastSyncTime)})`}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5 font-mono">
            <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
            <span>Real-time POS Active</span>
          </div>
        </div>
      }
    >
      {/* Stat Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 select-none">
        <StatCard
          title="POS Sales Revenue"
          value={formattedRevenue}
          description="from local checkouts"
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
          trend={{ value: `${transactionCount} orders`, type: "up" }}
        />
        <StatCard
          title="Gross Profit"
          value={formattedProfit}
          description="estimated markup profit"
          icon={<DollarSign className="w-4 h-4 text-primary" />}
          trend={{ value: `${marginPercentage.toFixed(1)}% margin`, type: "up" }}
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          description="inventory below safety limit"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          trend={lowStockCount > 0 ? { value: `${lowStockCount} items`, type: "down" } : undefined}
        />
        <StatCard
          title="Total Products (SKUs)"
          value={totalSkuCount}
          description="active catalog products"
          icon={<Package className="w-4 h-4 text-sky-500" />}
        />
      </div>

      {/* Main Grid: Recent Activity, Smart Alerts and Diagnostics */}
      <div className="grid gap-6 md:grid-cols-6 mt-8">
        {/* Recent Inventory audit trail */}
        <div className="md:col-span-4 space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-4.5 h-4.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Recent Inventory & Sales Activity
            </h2>
          </div>
          <DataTable
            columns={columns}
            data={movements.slice(0, 5)}
            emptyMessage="No stock movements logged."
          />
        </div>

        {/* Smart Alerts & Diagnostics Stack */}
        <div className="md:col-span-2 space-y-6">
          {/* Smart Alerts Card */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3 border-b border-border/55">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Smart Inventory Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 px-4 pb-4">
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {alerts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    ✓ All quiet. No inventory alerts logged.
                  </div>
                ) : (
                  alerts.map((alert, idx) => {
                    let alertBg = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                    let Icon = Info;
                    if (alert.type === "error") {
                      alertBg = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                      Icon = AlertCircle;
                    } else if (alert.type === "warning") {
                      alertBg = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                      Icon = AlertTriangle;
                    }

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-[11px] flex gap-2.5 items-start ${alertBg}`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h4 className="font-bold truncate leading-tight">{alert.title}</h4>
                          <p className="opacity-90 leading-tight">{alert.desc}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Desktop System Health */}
          {health && (
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="pb-3 border-b border-border/55">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-violet-500" /> Desktop System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> Platform</span>
                    <span className="font-mono text-foreground font-semibold">
                      {health.platform} ({health.arch})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">App Version</span>
                    <span className="font-mono text-foreground font-semibold">
                      v{health.app_version}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-border/30 pt-2">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Database className="w-3 h-3" /> SQLite Status</span>
                    <span className={`font-mono font-semibold flex items-center gap-1 ${health.db_status === "Healthy" ? "text-emerald-500" : "text-rose-500"}`}>
                      {health.db_status === "Healthy" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {health.db_status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Database Size</span>
                    <span className="font-mono text-foreground font-semibold">
                      {health.db_size_bytes < 1024 * 1024
                        ? `${(health.db_size_bytes / 1024).toFixed(1)} KB`
                        : `${(health.db_size_bytes / (1024 * 1024)).toFixed(2)} MB`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-border/30 pt-2">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> Products</span>
                    <span className="font-mono text-foreground font-semibold">{health.total_products.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Activity className="w-3 h-3" /> Movements</span>
                    <span className="font-mono text-foreground font-semibold">{health.total_movements.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Suppliers</span>
                    <span className="font-mono text-foreground font-semibold">{health.total_suppliers.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Users className="w-3 h-3" /> User Accounts</span>
                    <span className="font-mono text-foreground font-semibold">{health.total_users.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-border/30 pt-2">
                    <span className="text-muted-foreground">Network</span>
                    <span className={`font-mono font-semibold flex items-center gap-1 ${isOnline ? "text-emerald-500" : "text-rose-500"}`}>
                      {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-border/30 pt-2">
                    <span className="text-muted-foreground flex items-center gap-1.5"><ArrowUpCircle className="w-3 h-3 text-primary" /> Updates</span>
                    <span className="font-mono text-foreground font-semibold flex items-center gap-1">
                      {checkingUpdate ? (
                        <span className="text-muted-foreground animate-pulse">Checking...</span>
                      ) : updateInfo?.available ? (
                        <span className="text-amber-500 font-bold">Update Available (v{updateInfo.version})</span>
                      ) : (
                        <span className="text-emerald-500">Up to Date</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Updater Actions */}
                <div className="pt-3 border-t border-border/30">
                  {updateInfo?.available ? (
                    <Button
                      onClick={async () => {
                        setCheckingUpdate(true);
                        setUpdateStatusText("Installing update...");
                        try {
                          await installAndRestartUpdate();
                        } catch (err) {
                          alert("Failed to install update: " + err);
                          setUpdateStatusText("Install failed");
                        } finally {
                          setCheckingUpdate(false);
                        }
                      }}
                      disabled={checkingUpdate}
                      className="w-full h-8.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Install & Relaunch
                    </Button>
                  ) : (
                    <Button
                      onClick={() => runUpdateCheck(true)}
                      disabled={checkingUpdate}
                      variant="outline"
                      className="w-full h-8.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                      Check for Updates
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </PageContainer>
  );
}

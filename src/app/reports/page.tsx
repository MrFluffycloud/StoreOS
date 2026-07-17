"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getProducts, listInventoryMovements, getSettings } from "@/lib/ipc";
import {
  DollarSign,
  TrendingUp,
  Percent,
  ShoppingCart,
  Calendar,
  Download,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/components/layout/app-layout";
import { useAlerts } from "@/components/providers/alert-provider";

type DateRange = "today" | "7days" | "30days" | "all";

export default function ReportsPage() {
  const { session } = useAuth();
  const role = session?.role || "Admin";
  const { showAlert } = useAlerts();

  const [dateRange, setDateRange] = useState<DateRange>("7days");

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  // Access check
  if (role === "Cashier") {
    return (
      <PageContainer title="Reports & Analytics" subtitle="Access Denied">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Access Restricted</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Your Cashier account does not have permission to view the financial Reports module.
          </p>
        </div>
      </PageContainer>
    );
  }

  const isLoading = productsLoading || movementsLoading;

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: currency,
    });
  };

  // 1. Filter movements by date range
  const now = new Date();
  const filteredMovements = movements.filter((m) => {
    const date = new Date(m.timestamp);
    if (dateRange === "today") {
      return date.toDateString() === now.toDateString();
    }
    if (dateRange === "7days") {
      const threshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= threshold;
    }
    if (dateRange === "30days") {
      const threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date >= threshold;
    }
    return true; // All time
  });

  // 2. Perform financial summaries
  let totalSalesCents = 0;
  let totalCogsCents = 0;
  let transactionIds = new Set<string>();

  const productMap = new Map(products.map((p) => [p.id, p]));

  filteredMovements.forEach((m) => {
    const prod = productMap.get(m.productId);
    if (!prod) return;

    // Retrieve receipt ID
    const refId = m.referenceId || "";
    const receiptId = refId.split(" | ")[0] || m.id;

    if (m.movementType === "Sale") {
      const qty = Math.abs(m.quantity);
      totalSalesCents += qty * prod.priceCents;
      totalCogsCents += qty * prod.costCents;
      transactionIds.add(receiptId);
    } else if (m.movementType === "SalesReturn") {
      const qty = Math.abs(m.quantity);
      totalSalesCents -= qty * prod.priceCents;
      totalCogsCents -= qty * prod.costCents;
      transactionIds.add(receiptId);
    }
  });

  const netProfitCents = totalSalesCents - totalCogsCents;
  const profitMarginPercent = totalSalesCents > 0 ? (netProfitCents / totalSalesCents) * 100 : 0;

  // 3. Daily Sales Bar Chart data
  const getDailyData = () => {
    const daysMap = new Map<number, number>();

    // Group movements by date (start-of-day timestamp)
    filteredMovements.forEach((m) => {
      if (m.movementType !== "Sale" && m.movementType !== "SalesReturn") return;
      const prod = productMap.get(m.productId);
      if (!prod) return;

      const dateObj = new Date(m.timestamp);
      dateObj.setHours(0, 0, 0, 0);
      const dayTimestamp = dateObj.getTime();
      
      const amt = Math.abs(m.quantity) * prod.priceCents;
      const current = daysMap.get(dayTimestamp) || 0;
      if (m.movementType === "Sale") {
        daysMap.set(dayTimestamp, current + amt);
      } else {
        daysMap.set(dayTimestamp, current - amt);
      }
    });

    // Pre-fill missing dates for the chosen range so we don't have gaps
    if (dateRange !== "all") {
      const limit = dateRange === "30days" ? 30 : dateRange === "today" ? 1 : 7;
      for (let i = limit - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dayTimestamp = d.getTime();
        if (!daysMap.has(dayTimestamp)) {
          daysMap.set(dayTimestamp, 0);
        }
      }
    } else {
      // For "all" time, pre-fill all intermediate empty dates from oldest movement to today
      if (filteredMovements.length > 0) {
        let oldestDate = new Date();
        filteredMovements.forEach((m) => {
          const d = new Date(m.timestamp);
          if (d < oldestDate) {
            oldestDate = d;
          }
        });
        
        const temp = new Date(oldestDate.getTime());
        temp.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dayLimit = 365; // Safe maximum to prevent browser freeze on very old database
        let dayCount = 0;
        
        while (temp <= today && dayCount < dayLimit) {
          const dayTimestamp = temp.getTime();
          if (!daysMap.has(dayTimestamp)) {
            daysMap.set(dayTimestamp, 0);
          }
          temp.setDate(temp.getDate() + 1);
          dayCount++;
        }
      } else {
        // Default to last 7 days if no transactions
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          d.setHours(0, 0, 0, 0);
          const dayTimestamp = d.getTime();
          if (!daysMap.has(dayTimestamp)) {
            daysMap.set(dayTimestamp, 0);
          }
        }
      }
    }

    // Convert map to array, format date labels, and sort chronologically
    const dateSorted = Array.from(daysMap.entries()).map(([timestamp, val]) => {
      const dateObj = new Date(timestamp);
      const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { date: dateStr, sales: Math.max(0, val / 100), timestamp };
    });

    return dateSorted
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ date, sales }) => ({ date, sales }));
  };

  const chartData = getDailyData();
  const maxSales = Math.max(...chartData.map((d) => d.sales), 100);

  // 4. Sales by Category
  const categorySalesMap = new Map<string, { revenue: number; profit: number; qty: number }>();
  filteredMovements.forEach((m) => {
    if (m.movementType !== "Sale" && m.movementType !== "SalesReturn") return;
    const prod = productMap.get(m.productId);
    if (!prod) return;

    const cat = prod.category || "General";
    const current = categorySalesMap.get(cat) || { revenue: 0, profit: 0, qty: 0 };

    const qty = Math.abs(m.quantity);
    const rev = qty * prod.priceCents;
    const cogs = qty * prod.costCents;
    const prof = rev - cogs;

    if (m.movementType === "Sale") {
      categorySalesMap.set(cat, {
        revenue: current.revenue + rev,
        profit: current.profit + prof,
        qty: current.qty + qty,
      });
    } else {
      categorySalesMap.set(cat, {
        revenue: current.revenue - rev,
        profit: current.profit - prof,
        qty: current.qty - qty,
      });
    }
  });

  const categoryStats = Array.from(categorySalesMap.entries())
    .map(([category, data]) => ({
      category,
      revenue: Math.max(0, data.revenue),
      profit: Math.max(0, data.profit),
      qty: Math.max(0, data.qty),
      margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // 5. Sales by Top Products
  const productSalesMap = new Map<string, { name: string; sku: string; revenue: number; profit: number; qty: number }>();
  filteredMovements.forEach((m) => {
    if (m.movementType !== "Sale" && m.movementType !== "SalesReturn") return;
    const prod = productMap.get(m.productId);
    if (!prod) return;

    const current = productSalesMap.get(prod.id) || {
      name: prod.name,
      sku: prod.sku,
      revenue: 0,
      profit: 0,
      qty: 0,
    };

    const qty = Math.abs(m.quantity);
    const rev = qty * prod.priceCents;
    const cogs = qty * prod.costCents;
    const prof = rev - cogs;

    if (m.movementType === "Sale") {
      productSalesMap.set(prod.id, {
        ...current,
        revenue: current.revenue + rev,
        profit: current.profit + prof,
        qty: current.qty + qty,
      });
    } else {
      productSalesMap.set(prod.id, {
        ...current,
        revenue: current.revenue - rev,
        profit: current.profit - prof,
        qty: current.qty - qty,
      });
    }
  });

  const topProducts = Array.from(productSalesMap.values())
    .map((data) => ({
      ...data,
      revenue: Math.max(0, data.revenue),
      profit: Math.max(0, data.profit),
      qty: Math.max(0, data.qty),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // 6. Payment Shares
  let cashSales = 0;
  let cardSales = 0;
  let splitSales = 0;
  let upiSales = 0;

  filteredMovements.forEach((m) => {
    if (m.movementType !== "Sale") return;
    const prod = productMap.get(m.productId);
    if (!prod) return;

    const refId = m.referenceId || "";
    const parts = refId.split(" | ");
    const payPart = parts.find((p) => p.startsWith("Pay: "));
    const method = payPart ? payPart.replace("Pay: ", "").toLowerCase() : "cash";

    const amt = Math.abs(m.quantity) * prod.priceCents;
    if (method === "cash") cashSales += amt;
    else if (method === "card") cardSales += amt;
    else if (method === "upi") upiSales += amt;
    else if (method === "split") splitSales += amt;
  });

  const totalPayMethodSales = cashSales + cardSales + upiSales + splitSales || 1;

  const paymentStats = [
    { name: "Cash", amount: cashSales, percent: (cashSales / totalPayMethodSales) * 100 },
    { name: "Card", amount: cardSales, percent: (cardSales / totalPayMethodSales) * 100 },
    { name: "UPI", amount: upiSales, percent: (upiSales / totalPayMethodSales) * 100 },
    { name: "Split Cash/Card", amount: splitSales, percent: (splitSales / totalPayMethodSales) * 100 },
  ].sort((a, b) => b.amount - a.amount);

  return (
    <PageContainer
      title="Reports & Analytics"
      subtitle="Examine your sales, product margins, and payment method statistics"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await showAlert("Downloading CSV spreadsheets...", "Exporting Data", "info");
            }}
            className="flex items-center gap-1.5 h-8.5 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            Export Data
          </Button>
        </div>
      }
    >
      <div className="space-y-6 select-none">
        {/* Date Filters Header Card */}
        <div className="flex justify-between items-center bg-card border border-border p-3 rounded-lg shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Reporting Range</span>
          </div>
          <div className="flex border border-border rounded overflow-hidden text-[10px] font-semibold bg-background">
            <button
              onClick={() => setDateRange("today")}
              className={`py-1.5 px-3 border-r border-border hover:bg-muted/40 transition-colors ${
                dateRange === "today" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange("7days")}
              className={`py-1.5 px-3 border-r border-border hover:bg-muted/40 transition-colors ${
                dateRange === "7days" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange("30days")}
              className={`py-1.5 px-3 border-r border-border hover:bg-muted/40 transition-colors ${
                dateRange === "30days" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange("all")}
              className={`py-1.5 px-3 hover:bg-muted/40 transition-colors ${
                dateRange === "all" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-card animate-pulse border border-border" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI Metrics Grid */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Gross Sales</span>
                    <h3 className="text-lg font-bold font-mono text-foreground">{formatPrice(totalSalesCents)}</h3>
                  </div>
                  <div className="w-9 h-9 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Cost of Goods</span>
                    <h3 className="text-lg font-bold font-mono text-foreground">{formatPrice(totalCogsCents)}</h3>
                  </div>
                  <div className="w-9 h-9 rounded bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Net profit</span>
                    <h3 className="text-lg font-bold font-mono text-foreground">{formatPrice(netProfitCents)}</h3>
                  </div>
                  <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center text-primary">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Gross Margin</span>
                    <h3 className="text-lg font-bold font-mono text-foreground">{profitMarginPercent.toFixed(2)}%</h3>
                  </div>
                  <div className="w-9 h-9 rounded bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Percent className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Sales Bar Chart */}
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="p-4 border-b border-border/60">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">Sales Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-44 w-full flex items-end justify-between gap-2.5">
                  {chartData.map((d, idx) => {
                    const heightPercent = Math.max(8, Math.round((d.sales / maxSales) * 100));
                    return (
                      <div key={idx} className="h-full flex-1 flex flex-col justify-end items-center group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-[calc(100%+8px)] bg-popover border border-border px-2 py-1 rounded text-[9px] font-mono shadow-md text-popover-foreground scale-0 group-hover:scale-100 transition-all origin-bottom pointer-events-none whitespace-nowrap z-10">
                          {formatPrice(Math.round(d.sales * 100))}
                        </div>
                        {/* Bar */}
                        <div
                          style={{ 
                            height: `${heightPercent}%`, 
                            backgroundColor: d.sales > 0 ? "var(--primary)" : "var(--muted)" 
                          }}
                          className={`w-3.5 rounded-t transition-all duration-300 relative overflow-hidden cursor-pointer ${
                            d.sales > 0 ? "opacity-80 hover:opacity-100" : "opacity-30 hover:opacity-50"
                          }`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {/* Date label */}
                        <span className="text-[8px] text-muted-foreground mt-2 font-mono font-medium truncate w-full text-center">
                          {d.date}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Tables Grid */}
            <div className="grid grid-cols-3 gap-6">
              {/* Category Sales Share */}
              <Card className="bg-card border-border shadow-sm col-span-2">
                <CardHeader className="p-4 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">Category Performance</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/80 text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-semibold">
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4 text-center">Qty Sold</th>
                        <th className="py-2.5 px-4 text-right">Revenue</th>
                        <th className="py-2.5 px-4 text-right">Margin (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryStats.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-muted-foreground">
                            No category data for this range.
                          </td>
                        </tr>
                      ) : (
                        categoryStats.map((stat, i) => (
                          <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                            <td className="py-2 px-4 font-semibold text-foreground">{stat.category}</td>
                            <td className="py-2 px-4 text-center font-mono">{stat.qty}</td>
                            <td className="py-2 px-4 text-right font-mono font-bold text-foreground">{formatPrice(stat.revenue)}</td>
                            <td className="py-2 px-4 text-right font-mono text-muted-foreground">{stat.margin.toFixed(1)}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Payment Type Share */}
              <Card className="bg-card border-border shadow-sm">
                <CardHeader className="p-4 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">Payment Shares</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {paymentStats.every(p => p.amount === 0) ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No sales data for payment share.
                    </div>
                  ) : (
                    paymentStats.map((method, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-semibold">
                          <span className="text-foreground">{method.name}</span>
                          <span className="text-muted-foreground font-mono">
                            {formatPrice(method.amount)} ({method.percent.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            style={{ width: `${method.percent}%` }}
                            className={`h-full rounded-full ${
                              i === 0
                                ? "bg-primary"
                                : i === 1
                                ? "bg-blue-500"
                                : i === 2
                                ? "bg-emerald-500"
                                : "bg-purple-500"
                            }`}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Products Cards */}
            <Card className="bg-card border-border shadow-sm">
              <CardHeader className="p-4 border-b border-border/60">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">Top 5 Selling Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/80 text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-semibold">
                      <th className="py-2.5 px-4">Product Name</th>
                      <th className="py-2.5 px-4">SKU</th>
                      <th className="py-2.5 px-4 text-center">Qty Sold</th>
                      <th className="py-2.5 px-4 text-right">Revenue</th>
                      <th className="py-2.5 px-4 text-right">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          No product sales recorded in this range.
                        </td>
                      </tr>
                    ) : (
                      topProducts.map((p, i) => (
                        <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="py-2 px-4 font-semibold text-foreground">{p.name}</td>
                          <td className="py-2 px-4 font-mono text-muted-foreground">{p.sku}</td>
                          <td className="py-2 px-4 text-center font-mono">{p.qty}</td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-foreground">{formatPrice(p.revenue)}</td>
                          <td className="py-2 px-4 text-right font-mono font-semibold text-primary">{formatPrice(p.profit)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageContainer>
  );
}

"use client";

import React, { useState } from "react";
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
import { StoreOSAreaChart } from "@/components/charts/storeos-area-chart";
import { StoreOSBarChart } from "@/components/charts/storeos-bar-chart";
import { StoreOSDonutChart } from "@/components/charts/storeos-donut-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as DateCalendar } from "@/components/ui/calendar";

type DateRange = "today" | "7days" | "30days" | "all" | "custom";

export default function ReportsPage() {
  const { session } = useAuth();
  const role = session?.role || "Admin";
  const { showAlert } = useAlerts();

  const [dateRange, setDateRange] = useState<DateRange>("7days");
  const [customRange, setCustomRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  const formatRange = (range: { from: Date | undefined; to: Date | undefined }) => {
    if (!range.from) return "Select Dates";
    const fromStr = range.from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    if (!range.to) return fromStr;
    const toStr = range.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    return `${fromStr} - ${toStr}`;
  };

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
    staleTime: 30000,
    refetchOnWindowFocus: false,
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
    if (dateRange === "custom") {
      if (!customRange.from) return false;
      const start = new Date(customRange.from);
      start.setHours(0, 0, 0, 0);
      const end = customRange.to ? new Date(customRange.to) : new Date(customRange.from);
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
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
    if (dateRange === "today") {
      const hoursMap = new Map<number, number>();
      
      // Default business hours: 8 AM to 8 PM
      let startHour = 8;
      let endHour = 20;
      
      // Expand range based on actual transaction hours if any
      filteredMovements.forEach((m) => {
        if (m.movementType !== "Sale" && m.movementType !== "SalesReturn") return;
        const dateObj = new Date(m.timestamp);
        const hour = dateObj.getHours();
        if (hour < startHour) startHour = hour;
        if (hour > endHour) endHour = hour;
      });
      
      // Pre-fill determined hours
      for (let h = startHour; h <= endHour; h++) {
        hoursMap.set(h, 0);
      }
      
      // Group movements by hour
      filteredMovements.forEach((m) => {
        if (m.movementType !== "Sale" && m.movementType !== "SalesReturn") return;
        const prod = productMap.get(m.productId);
        if (!prod) return;
        
        const dateObj = new Date(m.timestamp);
        const hour = dateObj.getHours();
        
        const amt = Math.abs(m.quantity) * prod.priceCents;
        const current = hoursMap.get(hour) || 0;
        if (m.movementType === "Sale") {
          hoursMap.set(hour, current + amt);
        } else {
          hoursMap.set(hour, current - amt);
        }
      });
      
      return Array.from(hoursMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([hour, val]) => {
          const ampm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 === 0 ? 12 : hour % 12;
          const label = `${displayHour} ${ampm}`;
          return {
            date: label,
            sales: Math.max(0, val / 100),
          };
        });
    }

    // Otherwise, calculate daily data
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
    if (dateRange !== "all" && dateRange !== "custom") {
      const limit = dateRange === "30days" ? 30 : 7;
      for (let i = limit - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dayTimestamp = d.getTime();
        if (!daysMap.has(dayTimestamp)) {
          daysMap.set(dayTimestamp, 0);
        }
      }
    } else if (dateRange === "custom") {
      // For "custom", pre-fill all dates within the picked range
      const start = customRange.from ? new Date(customRange.from) : new Date();
      const end = customRange.to ? new Date(customRange.to) : new Date(start.getTime());
      
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      
      const temp = new Date(start.getTime());
      const dayLimit = 365; // Safe maximum
      let dayCount = 0;
      
      while (temp <= end && dayCount < dayLimit) {
        const dayTimestamp = temp.getTime();
        if (!daysMap.has(dayTimestamp)) {
          daysMap.set(dayTimestamp, 0);
        }
        temp.setDate(temp.getDate() + 1);
        dayCount++;
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
          <div className="flex items-center gap-3">
            {/* Custom Range Display/Picker — only shown when custom is selected */}
            {dateRange === "custom" && (
              <Popover>
                <PopoverTrigger render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-mono font-medium flex items-center gap-2 px-3 border-border/80 bg-background hover:bg-muted/40 transition-colors"
                  >
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{formatRange(customRange)}</span>
                  </Button>
                }>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border border-border/80 bg-popover rounded-lg shadow-xl z-50 overflow-hidden">
                  <DateCalendar
                    mode="range"
                    selected={customRange}
                    onSelect={(range: any) => {
                      if (range) {
                        setCustomRange(range);
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}

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
                className={`py-1.5 px-3 border-r border-border hover:bg-muted/40 transition-colors ${
                  dateRange === "all" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => {
                  setDateRange("custom");
                  if (!customRange.from) {
                    // Set default range to last 7 days when clicked
                    const to = new Date();
                    const from = new Date();
                    from.setDate(from.getDate() - 6);
                    setCustomRange({ from, to });
                  }
                }}
                className={`py-1.5 px-3 hover:bg-muted/40 transition-colors ${
                  dateRange === "custom" ? "bg-primary text-primary-foreground hover:bg-primary" : ""
                }`}
              >
                Custom
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6 select-none animate-pulse">
            {/* KPI Cards Skeleton */}
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="bg-card border border-border/80 p-4 flex items-center justify-between h-20">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded" />
                </Card>
              ))}
            </div>

            {/* Chart Skeleton */}
            <Card className="bg-card border border-border/80 p-6 flex flex-col justify-between h-64">
              <div className="space-y-1 mb-4">
                <Skeleton className="h-4.5 w-32" />
              </div>
              <div className="h-44 w-full flex items-end justify-between gap-4 px-2">
                {[...Array(15)].map((_, j) => {
                  const heights = ["h-12", "h-24", "h-36", "h-16", "h-28", "h-40", "h-20", "h-32", "h-44", "h-14", "h-30", "h-48"];
                  return <Skeleton key={j} className={`flex-1 rounded-t ${heights[j % heights.length]}`} />;
                })}
              </div>
            </Card>

            {/* Tables Grid Skeleton */}
            <div className="grid grid-cols-3 gap-6">
              <Card className="bg-card border border-border/80 p-6 col-span-2 space-y-4">
                <Skeleton className="h-4 w-44" />
                <div className="space-y-3">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="flex justify-between items-center h-10 border-b border-border/40 pb-2">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-16" />
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="bg-card border border-border/80 p-6 space-y-4">
                <Skeleton className="h-4 w-40" />
                <div className="space-y-3">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="flex justify-between items-center h-10 border-b border-border/40 pb-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-12" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
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

            {/* Sales Trend Bklit Area Chart */}
            <Card className="bg-card border border-border/70 shadow-sm">
              <CardHeader className="p-6 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4.5 h-4.5 text-primary" /> Sales Velocity Trend
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Gross checkout revenue breakdown across selected timeframe
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <StoreOSAreaChart
                  data={chartData}
                  xKey="date"
                  series={[{ key: "sales", label: "Sales Revenue", color: "rgb(99, 102, 241)" }]}
                  height={280}
                  formatYValue={(val) => formatPrice(val * 100).replace(".00", "")}
                />
              </CardContent>
            </Card>

            {/* Bklit Charts Grid: Category Bar + Payment Donut */}
            <div className="grid grid-cols-12 gap-8">
              <Card className="col-span-8 bg-card border border-border/70 shadow-sm">
                <CardHeader className="p-6 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Category Revenue vs. Profit
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <StoreOSBarChart
                    data={categoryStats.slice(0, 6).map((c) => ({
                      category: c.category,
                      Revenue: c.revenue / 100,
                      Profit: c.profit / 100,
                    }))}
                    xKey="category"
                    series={[
                      { key: "Revenue", label: `Revenue (${currency})`, color: "rgb(14, 165, 233)" },
                      { key: "Profit", label: `Profit (${currency})`, color: "rgb(16, 185, 129)" },
                    ]}
                    height={260}
                    formatYValue={(val) => formatPrice(val * 100).replace(".00", "")}
                  />
                </CardContent>
              </Card>

              <Card className="col-span-4 bg-card border border-border/70 shadow-sm">
                <CardHeader className="p-6 border-b border-border/60">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Payment Method Split
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <StoreOSDonutChart
                    data={paymentStats.map((p) => {
                      const colors: Record<string, string> = {
                        Cash: "rgb(16, 185, 129)",
                        Card: "rgb(14, 165, 233)",
                        UPI: "rgb(168, 85, 247)",
                        "Split Cash/Card": "rgb(245, 158, 11)",
                      };
                      return {
                        name: p.name,
                        value: p.amount / 100,
                        color: colors[p.name] || "rgb(99, 102, 241)",
                      };
                    })}
                    centerLabel="Total Sales"
                    centerValue={formatPrice(totalSalesCents).replace(".00", "")}
                    height={180}
                    formatValue={(val) => formatPrice(val * 100)}
                  />
                </CardContent>
              </Card>
            </div>

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

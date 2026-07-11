"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { DataTable } from "@/components/ui/data-table";
import { getInventorySummary, listInventoryMovements, getProducts } from "@/lib/ipc";
import { AdjustmentDialog } from "@/components/features/inventory/adjustment-dialog";
import { History, ClipboardList, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function InventoryPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineProductId, setTimelineProductId] = useState("");
  const [timelineProductName, setTimelineProductName] = useState("");
  const [timelineProductSku, setTimelineProductSku] = useState("");

  // Search and pagination states for Stock Levels
  const [searchSummary, setSearchSummary] = useState("");
  const [debouncedSummary, setDebouncedSummary] = useState("");
  const [summaryPage, setSummaryPage] = useState(1);

  // Search and pagination states for Audit Trail Movements
  const [searchMovements, setSearchMovements] = useState("");
  const [debouncedMovements, setDebouncedMovements] = useState("");
  const [movementsPage, setMovementsPage] = useState(1);

  const itemsPerPage = 50;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSummary(searchSummary);
      setSummaryPage(1);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchSummary]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedMovements(searchMovements);
      setMovementsPage(1);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchMovements]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const {
    data: summary = [],
    isLoading: loadingSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: getInventorySummary,
  });

  const {
    data: movements = [],
    isLoading: loadingMovements,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  const isLoading = loadingSummary || loadingMovements;

  // Filter Stock Level Summary
  const filteredSummary = summary.filter((s: any) => {
    const term = debouncedSummary.toLowerCase();
    return (
      (s.productName && s.productName.toLowerCase().includes(term)) ||
      (s.sku && s.sku.toLowerCase().includes(term))
    );
  });

  const totalSummaryPages = Math.ceil(filteredSummary.length / itemsPerPage);
  const displayedSummary = filteredSummary.slice(
    (summaryPage - 1) * itemsPerPage,
    summaryPage * itemsPerPage
  );

  // Filter Movements
  const filteredMovements = movements.filter((m: any) => {
    const term = debouncedMovements.toLowerCase();
    const prod = products.find((p) => p.id === m.productId);
    return (
      (m.productId && m.productId.toLowerCase().includes(term)) ||
      (m.movementType && m.movementType.toLowerCase().includes(term)) ||
      (m.referenceId && m.referenceId.toLowerCase().includes(term)) ||
      (prod && prod.name.toLowerCase().includes(term)) ||
      (prod && prod.sku.toLowerCase().includes(term))
    );
  });

  const totalMovementsPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const displayedMovements = filteredMovements.slice(
    (movementsPage - 1) * itemsPerPage,
    movementsPage * itemsPerPage
  );

  const handleRefresh = () => {
    refetchSummary();
    refetchMovements();
  };

  const handleViewTimeline = (prodId: string, name: string, sku: string) => {
    setTimelineProductId(prodId);
    setTimelineProductName(name);
    setTimelineProductSku(sku);
    setTimelineOpen(true);
  };

  const timelineMovements = movements
    .filter((m: any) => m.productId === timelineProductId)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const summaryColumns = [
    {
      header: "Product Name",
      sortValue: (s: any) => s.productName,
      accessor: (s: any) => (
        <span className="font-semibold text-xs text-foreground">{s.productName}</span>
      ),
    },
    {
      header: "SKU",
      sortValue: (s: any) => s.sku,
      accessor: (s: any) => <span className="font-mono text-xs">{s.sku}</span>,
    },
    {
      header: "On Hand Stock",
      sortValue: (s: any) => s.currentStock,
      accessor: (s: any) => {
        const isLow = s.currentStock < 25;
        return (
          <span
            className={`font-mono text-xs font-semibold ${
              isLow ? "text-amber-500 font-bold" : "text-foreground"
            }`}
          >
            {s.currentStock} units
          </span>
        );
      },
      className: "text-right",
    },
    {
      header: "Stock Status",
      sortValue: (s: any) => s.currentStock,
      accessor: (s: any) => {
        const isLow = s.currentStock < 25;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
              isLow
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {isLow ? "Low Stock" : "In Stock"}
          </span>
        );
      },
    },
    {
      header: "Actions",
      accessor: (s: any) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => handleViewTimeline(s.productId, s.productName, s.sku)}
            className="w-7 h-7 p-0 text-muted-foreground hover:text-foreground rounded-md flex items-center justify-center"
            title="View Timeline"
          >
            <History className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
      className: "text-right w-[60px]",
    },
  ];

  const movementColumns = [
    {
      header: "Timestamp",
      sortValue: (m: any) => new Date(m.timestamp).getTime(),
      accessor: (m: any) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(m.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: "SKU / Product",
      sortValue: (m: any) => {
        const prod = products.find((p) => p.id === m.productId);
        return prod ? prod.name : m.productId;
      },
      accessor: (m: any) => {
        const prod = products.find((p) => p.id === m.productId);
        return (
          <span className="font-mono text-xs font-medium text-foreground">
            {prod ? `${prod.name} (${prod.sku})` : m.productId}
          </span>
        );
      },
    },
    {
      header: "Type",
      sortValue: (m: any) => m.movementType,
      accessor: (m: any) => {
        let badgeColor = "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
        if (m.movementType === "Purchase") badgeColor = "bg-sky-500/10 text-sky-600 dark:text-sky-400";
        if (m.movementType === "Sale") badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
        if (m.movementType === "Damage") badgeColor = "bg-rose-500/10 text-rose-600 dark:text-rose-400";
        if (m.movementType === "SalesReturn" || m.movementType === "Return") badgeColor = "bg-teal-500/10 text-teal-600 dark:text-teal-400";
        if (m.movementType === "PurchaseReturn") badgeColor = "bg-orange-500/10 text-orange-600 dark:text-orange-400";
        if (m.movementType === "Adjustment") badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
        if (m.movementType === "Transfer") badgeColor = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";

        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${badgeColor}`}>
            {m.movementType}
          </span>
        );
      },
    },
    {
      header: "Quantity Changed",
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
      header: "Reference ID",
      sortValue: (m: any) => m.referenceId || "",
      accessor: (m: any) => (
        <span className="text-xs text-muted-foreground font-mono">
          {m.referenceId || "—"}
        </span>
      ),
      className: "text-right",
    },
  ];

  return (
    <PageContainer
      title="Inventory Control"
      subtitle="Monitor stock quantities, low alerts, and audit trails"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 h-8.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-8.5 text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Adjustment
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-6">
          <div className="w-full h-48 border rounded-lg animate-pulse bg-card" />
          <div className="w-full h-48 border rounded-lg animate-pulse bg-card" />
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Section 1: Stock Levels */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4.5 h-4.5 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Current Stock Levels (SKUs)
                </h2>
              </div>
              <div className="w-full md:w-72">
                <Input
                  type="text"
                  placeholder="Search stock SKU or name..."
                  value={searchSummary}
                  onChange={(e) => setSearchSummary(e.target.value)}
                  className="h-8.5 text-xs bg-background/50 border-border/80"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <DataTable
                columns={summaryColumns}
                data={displayedSummary}
                emptyMessage="No matching stock summaries found."
              />
              <PaginationControls
                currentPage={summaryPage}
                totalPages={totalSummaryPages}
                onPageChange={setSummaryPage}
                totalItems={filteredSummary.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </div>

          {/* Section 2: Audit Logs */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-4.5 h-4.5 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Stock Movements Audit Trail (All History)
                </h2>
              </div>
              <div className="w-full md:w-72">
                <Input
                  type="text"
                  placeholder="Search audit trail movements..."
                  value={searchMovements}
                  onChange={(e) => setSearchMovements(e.target.value)}
                  className="h-8.5 text-xs bg-background/50 border-border/80"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <DataTable
                columns={movementColumns}
                data={displayedMovements}
                emptyMessage="No matching stock history movements logged yet."
              />
              <PaginationControls
                currentPage={movementsPage}
                totalPages={totalMovementsPages}
                onPageChange={setMovementsPage}
                totalItems={filteredMovements.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </div>
        </div>
      )}

      <AdjustmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* Inventory Item Timeline Dialog */}
      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-md bg-card border-border select-none max-h-[80vh] overflow-y-auto">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Inventory Timeline Audit
            </DialogTitle>
            <div className="text-[10px] text-muted-foreground mt-1">
              Showing history for <span className="font-semibold text-foreground">{timelineProductName}</span> ({timelineProductSku})
            </div>
          </DialogHeader>

          <div className="pt-4">
            {timelineMovements.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">
                No movements recorded for this product.
              </p>
            ) : (
              <div className="relative border-l border-border/60 ml-3.5 pl-6 space-y-5">
                {timelineMovements.map((m) => {
                  const isPositive = m.quantity > 0;
                  
                  // Parse reference details
                  const parts = m.referenceId?.split(" | ") || [];
                  const voucher = parts[0] || m.referenceId || "Direct Adjustment";
                  const operator = m.employeeId || "System";
                  const godownPart = parts.find((p: string) => p.startsWith("Godown: "));
                  const godownText = godownPart ? godownPart.replace("Godown: ", "") : "";

                  let badgeColor = "bg-zinc-500/10 text-zinc-500 border-zinc-500/25";
                  if (m.movementType === "Purchase") badgeColor = "bg-sky-500/10 text-sky-500 border-sky-500/25";
                  if (m.movementType === "Sale") badgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/25";
                  if (m.movementType === "Damage") badgeColor = "bg-rose-500/10 text-rose-500 border-rose-500/25";
                  if (m.movementType === "SalesReturn" || m.movementType === "Return") badgeColor = "bg-teal-500/10 text-teal-500 border-teal-500/25";
                  if (m.movementType === "PurchaseReturn") badgeColor = "bg-orange-500/10 text-orange-500 border-orange-500/25";
                  if (m.movementType === "Adjustment") badgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/25";

                  return (
                    <div key={m.id} className="relative group">
                      {/* Timeline Bullet */}
                      <span className={`absolute -left-[31px] top-1.5 w-2 h-2 rounded-full border border-card ${
                        isPositive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                      }`} />
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-muted-foreground">
                            {new Date(m.timestamp).toLocaleString()}
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                            {m.movementType}
                          </span>
                        </div>
                        <div className="text-xs text-foreground font-semibold flex items-center justify-between">
                          <span>
                            {isPositive ? "Stock Received" : "Stock Dispatched"}
                            {godownText && <span className="text-[10px] font-normal text-muted-foreground"> ({godownText})</span>}
                          </span>
                          <span className={`font-mono text-xs ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
                            {isPositive ? "+" : ""}{m.quantity} units
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex justify-between">
                          <span>Ref: {voucher}</span>
                          <span>Operator: {operator}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-border/80 mt-4">
            <Button size="sm" className="h-8 text-xs" onClick={() => setTimelineOpen(false)}>
              Close Audit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

function PaginationControls({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between py-2 px-1 border-t border-border/40 text-[11px] text-muted-foreground select-none">
      <div>
        Showing <span className="font-semibold text-foreground">{Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(totalItems, currentPage * itemsPerPage)}</span> of <span className="font-semibold text-foreground">{totalItems}</span> records
      </div>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-7 px-2.5 text-[10px]"
        >
          Previous
        </Button>
        <div className="flex items-center px-2 font-mono text-[10px]">
          Page {currentPage} of {totalPages}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-7 px-2.5 text-[10px]"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

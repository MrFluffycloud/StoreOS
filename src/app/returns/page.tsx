"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getProducts,
  addInventoryMovement,
  getSettings,
  listInventoryMovements,
} from "@/lib/ipc";
import { Product } from "@/types/storeos";
import { Undo2, Plus, RefreshCw, ShoppingCart, Truck, Trash2, Eye, Receipt } from "lucide-react";
import { SearchableProductSelect } from "@/components/features/products/searchable-select";

interface ReturnItemRow {
  productId: string;
  quantity: number;
  rate: number;
  maxQty?: number;
}

export default function ReturnsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);

  // Return form states
  const [voucherNo, setVoucherNo] = useState("");
  const [selectedOriginalInvoiceId, setSelectedOriginalInvoiceId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [godown, setGodown] = useState("Primary");
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("Defective");
  const [rows, setRows] = useState<ReturnItemRow[]>([
    { productId: "", quantity: 1, rate: 0 }
  ]);
  const [error, setError] = useState<string | null>(null);

  // Search and pagination states for list view
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Queries
  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const taxRate = parseFloat(dbSettings.find((s) => s.key === "tax_rate")?.value || "0.0825");

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const {
    data: movements = [],
    isLoading: loadingMovements,
    refetch: refetchMovements,
    isRefetching,
  } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  // Reconstruct Sales Invoices (POS) and Purchase Invoices dynamically for selection
  const originalSalesInvoices = new Map<string, { id: string; customerName: string; timestamp: string; items: { productId: string; quantity: number; rate: number }[] }>();
  const originalPurchaseInvoices = new Map<string, { id: string; supplierName: string; timestamp: string; items: { productId: string; quantity: number; rate: number }[] }>();

  movements.forEach((m) => {
    if (m.referenceType === "POSReceipt" && m.movementType === "Sale") {
      const refId = m.referenceId || "UNGROUPED";
      let receiptId = refId;
      let customerName = "General Customer";
      
      if (refId.includes(" | ")) {
        const parts = refId.split(" | ");
        receiptId = parts[0];
        parts.forEach((p) => {
          if (p.startsWith("Cust: ")) customerName = p.replace("Cust: ", "");
        });
      }

      const prod = products.find(p => p.id === m.productId);
      const rate = prod ? prod.priceCents / 100 : 0;

      if (!originalSalesInvoices.has(receiptId)) {
        originalSalesInvoices.set(receiptId, {
          id: receiptId,
          customerName,
          timestamp: m.timestamp,
          items: [],
        });
      }
      originalSalesInvoices.get(receiptId)!.items.push({
        productId: m.productId,
        quantity: Math.abs(m.quantity),
        rate,
      });
    } else if (m.movementType === "Purchase") {
      const refId = m.referenceId || "UNGROUPED";
      let voucherNoText = refId;
      let supName = "General Supplier";
      
      if (refId.includes(" | ")) {
        const parts = refId.split(" | ");
        voucherNoText = parts[0];
        parts.forEach((p) => {
          if (p.startsWith("Supplier: ")) supName = p.replace("Supplier: ", "");
        });
      }

      const prod = products.find(p => p.id === m.productId);
      const rate = prod ? prod.costCents / 100 : 0;

      if (!originalPurchaseInvoices.has(voucherNoText)) {
        originalPurchaseInvoices.set(voucherNoText, {
          id: voucherNoText,
          supplierName: supName,
          timestamp: m.timestamp,
          items: [],
        });
      }
      originalPurchaseInvoices.get(voucherNoText)!.items.push({
        productId: m.productId,
        quantity: Math.abs(m.quantity),
        rate,
      });
    }
  });

  const handleOriginalInvoiceChange = (invId: string) => {
    setSelectedOriginalInvoiceId(invId);
    if (!invId) return;

    if (activeTab === "sales") {
      const inv = originalSalesInvoices.get(invId);
      if (inv) {
        setPartyName(inv.customerName);
        setRows(
          inv.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            rate: it.rate,
            maxQty: it.quantity,
          }))
        );
      }
    } else {
      const inv = originalPurchaseInvoices.get(invId);
      if (inv) {
        setPartyName(inv.supplierName);
        setRows(
          inv.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            rate: it.rate,
            maxQty: it.quantity,
          }))
        );
      }
    }
  };

  // Group return movements by return voucher number
  const returnsMap = new Map<string, any>();
  const targetMType = activeTab === "sales" ? "SalesReturn" : "PurchaseReturn";

  movements.forEach((m) => {
    if (m.movementType === targetMType) {
      const refId = m.referenceId || "UNGROUPED";
      let voucherNoText = refId;
      let name = activeTab === "sales" ? "General Customer" : "General Supplier";
      let gd = "Primary";
      let rem = "";

      if (refId.includes(" | ")) {
        const parts = refId.split(" | ");
        voucherNoText = parts[0];
        parts.forEach((p) => {
          if (p.startsWith("Name: ")) name = p.replace("Name: ", "");
          if (p.startsWith("Godown: ")) gd = p.replace("Godown: ", "");
          if (p.startsWith("Remarks: ")) rem = p.replace("Remarks: ", "");
        });
      }

      if (!returnsMap.has(voucherNoText)) {
        returnsMap.set(voucherNoText, {
          voucherNo: voucherNoText,
          partyName: name,
          godown: gd,
          remarks: rem,
          timestamp: m.timestamp,
          items: [],
        });
      }

      const invoice = returnsMap.get(voucherNoText);
      invoice.items.push(m);
    }
  });

  const rawReturns = Array.from(returnsMap.values());

  const filteredReturns = rawReturns.filter((inv) => {
    const s = debouncedSearch.toLowerCase();
    return (
      inv.voucherNo.toLowerCase().includes(s) ||
      inv.partyName.toLowerCase().includes(s) ||
      inv.godown.toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const displayedReturns = filteredReturns
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: currency,
    });
  };

  // Row operations
  const addRow = () => {
    setRows([...rows, { productId: "", quantity: 1, rate: 0 }]);
  };

  const deleteRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleRowProductChange = (index: number, prodId: string) => {
    const updated = [...rows];
    updated[index].productId = prodId;
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      updated[index].rate = activeTab === "sales" ? prod.priceCents / 100 : prod.costCents / 100;
    }
    setRows(updated);
  };

  const updateRowField = (index: number, field: keyof ReturnItemRow, value: number) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  // Pricing calculations
  const grossSubtotal = rows.reduce(
    (acc, row) => acc + row.quantity * row.rate,
    0
  );

  const subtotalCents = Math.round(grossSubtotal * 100);
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents;

  const returnMutation = useMutation({
    mutationFn: async () => {
      const prefix = activeTab === "sales" ? "SR" : "PR";
      const finalVoucherNo = voucherNo.trim() || `${prefix}-${Date.now().toString().slice(-4)}`;
      const finalRefId = `${finalVoucherNo} | Name: ${partyName || "General Party"} | Godown: ${godown} | Remarks: ${remarks || reason}`;

      for (const row of rows) {
        if (!row.productId) continue;

        const quantitySigned = activeTab === "sales" ? Math.abs(row.quantity) : -Math.abs(row.quantity);

        await addInventoryMovement({
          productId: row.productId,
          quantity: quantitySigned,
          movementType: activeTab === "sales" ? "SalesReturn" : "PurchaseReturn",
          referenceType: activeTab === "sales" ? "SalesReturnInvoice" : "PurchaseReturnInvoice",
          referenceId: finalRefId,
          employeeId: "system",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCreatorOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to log return entry.");
    },
  });

  const resetForm = () => {
    setVoucherNo("");
    setSelectedOriginalInvoiceId("");
    setPartyName("");
    setRemarks("");
    setGodown("Primary");
    setRows([{ productId: "", quantity: 1, rate: 0 }]);
    setReason(activeTab === "sales" ? "Defective" : "Damaged Shipment");
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setVoucherNo((rawReturns.length + 51).toString());
    setCreatorOpen(true);
  };

  const handleViewInvoice = (invoice: any) => {
    setSelectedVoucher(invoice);
    setViewerOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasEmptyProduct = rows.some((r) => !r.productId);
    if (hasEmptyProduct) {
      setError("Please select a product for all rows, or delete empty rows.");
      return;
    }

    if (selectedOriginalInvoiceId) {
      for (const row of rows) {
        if (row.maxQty !== undefined && row.quantity > row.maxQty) {
          const prod = products.find((p) => p.id === row.productId);
          setError(
            `Quantity to return (${row.quantity}) exceeds units purchased (${row.maxQty}) for item: ${prod?.name || row.productId}`
          );
          return;
        }
      }
    }

    returnMutation.mutate();
  };

  const columnsList = [
    {
      header: "Voucher No",
      sortValue: (inv: any) => inv.voucherNo,
      accessor: (inv: any) => (
        <span className="font-mono font-semibold text-xs text-foreground">
          #{inv.voucherNo}
        </span>
      ),
    },
    {
      header: "Date & Time",
      sortValue: (inv: any) => new Date(inv.timestamp).getTime(),
      accessor: (inv: any) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(inv.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: activeTab === "sales" ? "Customer Name" : "Supplier Name",
      sortValue: (inv: any) => inv.partyName,
      accessor: (inv: any) => (
        <span className="font-semibold text-xs text-foreground">
          {inv.partyName}
        </span>
      ),
    },
    {
      header: "Godown",
      sortValue: (inv: any) => inv.godown,
      accessor: (inv: any) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
          {inv.godown}
        </span>
      ),
    },
    {
      header: "Quantity",
      sortValue: (inv: any) => inv.items.reduce((acc: number, m: any) => acc + Math.abs(m.quantity), 0),
      accessor: (inv: any) => {
        const totalQty = inv.items.reduce((acc: number, m: any) => acc + Math.abs(m.quantity), 0);
        return (
          <span className={`font-mono text-xs font-semibold ${activeTab === "sales" ? "text-emerald-500" : "text-rose-500"}`}>
            {activeTab === "sales" ? "+" : "-"}
            {totalQty} units
          </span>
        );
      },
      className: "text-right",
    },
    {
      header: "Actions",
      accessor: (inv: any) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => handleViewInvoice(inv)}
            className="w-7 h-7 p-0 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
            title="View Invoice details"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
      className: "text-right",
    },
  ];

  const isLoading = loadingProducts || loadingMovements;

  return (
    <PageContainer
      title="Returns Invoicing"
      subtitle="Process customer sales return credits and supplier purchase return debits"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchMovements()}
            disabled={isLoading || isRefetching}
            className="flex items-center gap-1.5 h-8.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" className="h-8.5 text-xs font-medium flex items-center gap-1.5" onClick={handleOpenCreate}>
            <Plus className="w-3.5 h-3.5" />
            {activeTab === "sales" ? "New Sales Return Invoice" : "New Purchase Return" }
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Tab Headers */}
        <div className="flex border-b border-border/60 gap-6 select-none">
          <button
            onClick={() => {
              setActiveTab("sales");
              resetForm();
            }}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "sales"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Sales Returns (Customer)
          </button>
          <button
            onClick={() => {
              setActiveTab("purchases");
              resetForm();
            }}
            className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === "purchases"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Purchase Returns (Supplier)
          </button>
        </div>

        {/* Filters and List */}
        <div className="space-y-4">
          <div className="max-w-md">
            <Input
              type="text"
              placeholder={`Search returns by Voucher No, ${activeTab === "sales" ? "Customer" : "Supplier"}, or Godown...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 text-xs bg-background/50 border-border/80"
            />
          </div>

          {isLoading ? (
            <div className="w-full h-64 border rounded-lg animate-pulse bg-card" />
          ) : (
            <div className="space-y-4">
              <DataTable
                columns={columnsList}
                data={displayedReturns}
                emptyMessage={
                  activeTab === "sales"
                    ? "No sales returns invoices recorded."
                    : "No purchase returns invoices recorded."
                }
              />
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredReturns.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* High Fidelity Returns entry dialog */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-w-[95vw] w-[900px] bg-card border-border select-none max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Undo2 className="w-4 h-4 text-primary" />
              {activeTab === "sales" ? "New Customer Sales Return" : "New Supplier Purchase Return"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-3 text-xs">
            {/* Form Fields Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="voucherNo" className="font-semibold text-foreground">Return Voucher No *</Label>
                <Input
                  id="voucherNo"
                  value={voucherNo}
                  onChange={(e) => setVoucherNo(e.target.value)}
                  placeholder="e.g. 58"
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              {/* Linked Original Invoice Picker */}
              <div className="space-y-1.5">
                <Label htmlFor="origInvoice" className="font-semibold text-foreground">
                  {activeTab === "sales" ? "Link POS Receipt (Optional)" : "Link Purchase Voucher (Optional)"}
                </Label>
                <select
                  id="origInvoice"
                  value={selectedOriginalInvoiceId}
                  onChange={(e) => handleOriginalInvoiceChange(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground focus:outline-none font-mono"
                >
                  <option value="">Select Invoice</option>
                  {activeTab === "sales"
                    ? Array.from(originalSalesInvoices.values()).map((si) => (
                        <option key={si.id} value={si.id}>
                          {si.id} (Cust: {si.customerName})
                        </option>
                      ))
                    : Array.from(originalPurchaseInvoices.values()).map((pi) => (
                        <option key={pi.id} value={pi.id}>
                          {pi.id} (Supplier: {pi.supplierName})
                        </option>
                      ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="partyName" className="font-semibold text-foreground">
                  {activeTab === "sales" ? "Customer Name" : "Supplier Name"}
                </Label>
                <Input
                  id="partyName"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder={activeTab === "sales" ? "Customer Name" : "Supplier Name"}
                  className="h-9 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="godown" className="font-semibold text-foreground">Godown Location</Label>
                <select
                  id="godown"
                  value={godown}
                  onChange={(e) => setGodown(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Primary">Primary Shopfloor</option>
                  <option value="Godown A">Godown A Warehouse</option>
                  <option value="Godown B">Godown B Warehouse</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="font-semibold text-foreground">Return Reason</Label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                >
                  {activeTab === "sales" ? (
                    <>
                      <option value="Defective">Defective / Damaged Item</option>
                      <option value="Wrong Item">Wrong Item Sold</option>
                      <option value="Customer Dissatisfied">Customer Dissatisfied</option>
                    </>
                  ) : (
                    <>
                      <option value="Damaged Shipment">Damaged Supply Shipment</option>
                      <option value="Wrong Goods">Incorrect Supply Received</option>
                      <option value="Excess Inventory">Excess Stock Return</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="remarks" className="font-semibold text-foreground">Remarks</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Memos or annotations..."
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded font-semibold">
                Error: {error}
              </div>
            )}

            {/* Rows Table Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">Return Items</h3>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={addRow}>
                  + Add Item Row
                </Button>
              </div>

              <div className="border border-border rounded-xl overflow-hidden bg-card shadow-inner max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/80 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      <th className="py-2 px-3 w-[45px] text-center">SI</th>
                      <th className="py-2 px-3 min-w-[250px]">Item Name</th>
                      <th className="py-2 px-3 w-[120px] text-right">Qty</th>
                      <th className="py-2 px-3 w-[150px] text-right">
                        Rate ({currency})
                      </th>
                      <th className="py-2 px-3 w-[150px] text-right">Gross Amt</th>
                      <th className="py-2 px-3 w-[50px] text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const gross = row.quantity * row.rate;

                      return (
                        <tr key={index} className="border-b border-border/40 hover:bg-muted/5 transition-colors">
                          <td className="py-1 px-3 text-center text-muted-foreground font-mono">{index + 1}</td>
                          <td className="py-1 px-3">
                            <SearchableProductSelect
                              products={products}
                              selectedProductId={row.productId}
                              onChange={(id) => handleRowProductChange(index, id)}
                              placeholder="Select product..."
                            />
                          </td>
                          <td className="py-1 px-3">
                            <Input
                              type="number"
                              min="1"
                              max={row.maxQty}
                              value={row.productId ? row.quantity : ""}
                              disabled={!row.productId}
                              onChange={(e) => updateRowField(index, "quantity", parseInt(e.target.value) || 0)}
                              className="h-8 text-right font-mono"
                            />
                            {row.maxQty !== undefined && (
                              <div className="text-[9px] text-muted-foreground text-right mt-0.5 font-mono">
                                Max: {row.maxQty} units
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.productId ? row.rate : ""}
                              disabled={!row.productId}
                              onChange={(e) => updateRowField(index, "rate", parseFloat(e.target.value) || 0)}
                              className="h-8 text-right font-mono"
                            />
                          </td>
                          <td className="py-1 px-3 text-right font-mono font-medium text-muted-foreground">
                            {row.productId ? (gross).toFixed(2) : "—"}
                          </td>
                          <td className="py-1 px-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => deleteRow(index)}
                              disabled={rows.length === 1}
                              className="w-7 h-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calculations and summary card */}
            <div className="flex justify-end pt-4 border-t border-border">
              <div className="w-full max-w-xs space-y-1.5 p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono text-foreground">{formatPrice(subtotalCents)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Tax ({ (taxRate * 100).toFixed(2) }%):</span>
                  <span className="font-mono text-foreground">{formatPrice(taxCents)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-foreground border-t pt-1.5 mt-1">
                  <span>Grand Total:</span>
                  <span className="font-mono text-primary">{formatPrice(totalCents)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreatorOpen(false)} className="h-9 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={returnMutation.isPending} className="h-9 text-xs bg-primary text-primary-foreground font-semibold px-4">
                {returnMutation.isPending ? "Logging Return..." : "Save Return"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Return Details Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-[90vw] w-[600px] bg-card border-border select-none text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-primary" />
              Return Voucher Details: #{selectedVoucher?.voucherNo}
            </DialogTitle>
          </DialogHeader>

          {selectedVoucher && (
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/20 p-3 rounded border border-border/40 font-mono text-[10px] text-muted-foreground">
                <div><span className="text-foreground font-semibold">{activeTab === "sales" ? "Customer:" : "Supplier:"}</span> {selectedVoucher.partyName}</div>
                <div><span className="text-foreground font-semibold">Origin Godown:</span> {selectedVoucher.godown}</div>
                <div><span className="text-foreground font-semibold">Date Logged:</span> {new Date(selectedVoucher.timestamp).toLocaleString()}</div>
                <div><span className="text-foreground font-semibold">Remarks:</span> {selectedVoucher.remarks || "—"}</div>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-bold text-foreground">Returned Items Summary</h3>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="bg-muted text-[10px] uppercase font-bold text-muted-foreground border-b border-border/80">
                        <th className="py-1.5 px-3">Item</th>
                        <th className="py-1.5 px-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.items.map((item: any, i: number) => {
                        const prod = products.find((p) => p.id === item.productId);
                        return (
                          <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                            <td className="py-1.5 px-3">{prod ? prod.name : item.productId}</td>
                            <td className="py-1.5 px-3 text-right font-semibold">
                              {activeTab === "sales" ? "+" : "-"}
                              {Math.abs(item.quantity)} units
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
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

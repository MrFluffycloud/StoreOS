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
  updateProduct,
  getSuppliers,
} from "@/lib/ipc";
import { Product, Supplier } from "@/types/storeos";
import { Plus, RefreshCw, ShoppingBag, Receipt, Trash2, Eye } from "lucide-react";
import { SearchableProductSelect } from "@/components/features/products/searchable-select";

interface PurchaseItemRow {
  productId: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
}

export default function PurchasesPage() {
  const queryClient = useQueryClient();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);

  // Invoice form states
  const [voucherNo, setVoucherNo] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [address, setAddress] = useState("");
  const [godown, setGodown] = useState("Primary");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<PurchaseItemRow[]>([
    { productId: "", quantity: 10, unitCost: 0, salePrice: 0 }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [updateCatalogCost, setUpdateCatalogCost] = useState(true);

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

  const { data: dbSuppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
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

  // Group restock movements by voucher number
  const purchaseInvoicesMap = new Map<string, any>();

  movements.forEach((m) => {
    if (m.movementType === "Purchase") {
      const refId = m.referenceId || "UNGROUPED";
      
      let voucherNoText = refId;
      let supName = "General Supplier";
      let gd = "Primary";
      let rem = "";

      if (refId.includes(" | ")) {
        const parts = refId.split(" | ");
        voucherNoText = parts[0];
        parts.forEach((p) => {
          if (p.startsWith("Supplier: ")) supName = p.replace("Supplier: ", "");
          if (p.startsWith("Party: ")) supName = p.replace("Party: ", "");
          if (p.startsWith("Godown: ")) gd = p.replace("Godown: ", "");
          if (p.startsWith("Remarks: ")) rem = p.replace("Remarks: ", "");
        });
      }

      if (!purchaseInvoicesMap.has(voucherNoText)) {
        purchaseInvoicesMap.set(voucherNoText, {
          voucherNo: voucherNoText,
          supplierName: supName,
          godown: gd,
          remarks: rem,
          timestamp: m.timestamp,
          items: [],
        });
      }

      const invoice = purchaseInvoicesMap.get(voucherNoText);
      invoice.items.push(m);
    }
  });

  const rawPurchaseInvoices = Array.from(purchaseInvoicesMap.values());

  const filteredInvoices = rawPurchaseInvoices.filter((inv) => {
    const s = debouncedSearch.toLowerCase();
    return (
      inv.voucherNo.toLowerCase().includes(s) ||
      inv.supplierName.toLowerCase().includes(s) ||
      inv.godown.toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const displayedInvoices = filteredInvoices
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
    setRows([...rows, { productId: "", quantity: 1, unitCost: 0, salePrice: 0 }]);
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
      updated[index].unitCost = prod.costCents / 100;
      updated[index].salePrice = prod.priceCents / 100;
    }
    setRows(updated);
  };

  const updateRowField = (index: number, field: keyof PurchaseItemRow, value: number) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  // Pricing calculations
  const grossSubtotal = rows.reduce(
    (acc, row) => acc + row.quantity * row.unitCost,
    0
  );

  const subtotalCents = Math.round(grossSubtotal * 100);
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const finalVoucherNo = voucherNo.trim() || `PO-${Date.now().toString().slice(-4)}`;
      const finalRefId = `${finalVoucherNo} | Supplier: ${supplierName || "General Supplier"} | Godown: ${godown} | Remarks: ${remarks || "None"}`;

      for (const row of rows) {
        if (!row.productId) continue;
        const prod = products.find((p) => p.id === row.productId);
        if (!prod) continue;

        // 1. Add Positive restock movement
        await addInventoryMovement({
          productId: row.productId,
          quantity: row.quantity,
          movementType: "Purchase",
          referenceType: "PurchaseInvoice",
          referenceId: finalRefId,
          employeeId: "system",
        });

        // 2. Automatically update catalog unit cost and retail price
        if (updateCatalogCost) {
          const costCents = Math.round(row.unitCost * 100);
          const priceCents = Math.round(row.salePrice * 100);
          await updateProduct(prod.id, {
            name: prod.name,
            sku: prod.sku,
            barcode: prod.barcode || undefined,
            description: prod.description || undefined,
            priceCents: priceCents,
            costCents: costCents,
            category: prod.category || undefined,
          });
        }
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
      setError(err.message || "Failed to save purchase invoice.");
    },
  });

  const resetForm = () => {
    setVoucherNo("");
    setSupplierName("");
    setAddress("");
    setGodown("Primary");
    setRemarks("");
    setRows([{ productId: "", quantity: 10, unitCost: 0, salePrice: 0 }]);
    setError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setVoucherNo((rawPurchaseInvoices.length + 101).toString());
    setCreatorOpen(true);
  };

  const handleViewInvoice = (invoice: any) => {
    setSelectedVoucher(invoice);
    setViewerOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasEmptyProduct = rows.some((r) => !r.productId);
    if (hasEmptyProduct) {
      setError("Please select a product for all rows, or delete empty rows.");
      return;
    }

    saveMutation.mutate();
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
      header: "Supplier Name",
      sortValue: (inv: any) => inv.supplierName,
      accessor: (inv: any) => (
        <span className="font-semibold text-xs text-foreground">
          {inv.supplierName}
        </span>
      ),
    },
    {
      header: "Destination Godown",
      sortValue: (inv: any) => inv.godown,
      accessor: (inv: any) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
          {inv.godown}
        </span>
      ),
    },
    {
      header: "Items Received",
      sortValue: (inv: any) => inv.items.reduce((acc: number, m: any) => acc + m.quantity, 0),
      accessor: (inv: any) => {
        const totalQty = inv.items.reduce((acc: number, m: any) => acc + m.quantity, 0);
        return (
          <span className="font-mono text-xs text-foreground font-semibold">
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
      title="Purchase Invoices"
      subtitle="Log inventory restock shipments received from manufacturing partners"
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
            New Purchase Invoice
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search filter list */}
        <div className="max-w-md">
          <Input
            type="text"
            placeholder="Search purchase vouchers by Voucher No or Supplier..."
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
              data={displayedInvoices}
              emptyMessage="No purchase invoices logged yet."
            />
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredInvoices.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        )}
      </div>

      {/* New Purchase Invoice Entry Dialog */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-w-[95vw] w-[900px] bg-card border-border select-none max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-primary" />
              New Purchase Restock Invoice
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-3 text-xs">
            {/* Header properties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="voucherNo" className="font-semibold text-foreground">Voucher Number *</Label>
                <Input
                  id="voucherNo"
                  value={voucherNo}
                  onChange={(e) => setVoucherNo(e.target.value)}
                  placeholder="e.g. 101"
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplierSelect" className="font-semibold text-foreground">Supplier *</Label>
                <select
                  id="supplierSelect"
                  value={supplierName}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    const sup = dbSuppliers.find((s) => s.name === e.target.value);
                    if (sup) {
                      setAddress(sup.email || `Phone: ${sup.phone || "—"}`);
                    }
                  }}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">Select Supplier</option>
                  {dbSuppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="godown" className="font-semibold text-foreground">Destination Godown</Label>
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
                <Label htmlFor="remarks" className="font-semibold text-foreground">Remarks / Description</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Additional Restock memos..."
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded font-semibold">
                Error: {error}
              </div>
            )}

            {/* Items Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">Purchase Items</h3>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={addRow}>
                  + Add Item Row
                </Button>
              </div>

              <div className="border border-border/80 rounded-xl overflow-hidden bg-card shadow-inner max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/80 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      <th className="py-2 px-3 w-[45px] text-center">SI</th>
                      <th className="py-2 px-3 min-w-[250px]">Choose Catalog Item</th>
                      <th className="py-2 px-3 w-[100px] text-right">Qty</th>
                      <th className="py-2 px-3 w-[120px] text-right">Cost Rate ({currency})</th>
                      <th className="py-2 px-3 w-[120px] text-right">Retail Price ({currency})</th>
                      <th className="py-2 px-3 w-[120px] text-right">Gross Amt</th>
                      <th className="py-2 px-3 w-[50px] text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const grossAmt = row.quantity * row.unitCost;
                      
                      return (
                        <tr key={index} className="border-b border-border/40 hover:bg-muted/5 transition-colors">
                          <td className="py-1 px-3 text-center text-muted-foreground font-mono">{index + 1}</td>
                          <td className="py-1 px-3">
                            <SearchableProductSelect
                              products={products}
                              selectedProductId={row.productId}
                              onChange={(id) => handleRowProductChange(index, id)}
                              placeholder="Choose catalog item..."
                            />
                          </td>
                          <td className="py-1 px-3">
                            <Input
                              type="number"
                              min="1"
                              value={row.productId ? row.quantity : ""}
                              disabled={!row.productId}
                              onChange={(e) => updateRowField(index, "quantity", parseInt(e.target.value) || 0)}
                              className="h-8 text-right font-mono"
                            />
                          </td>
                          <td className="py-1 px-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.productId ? row.unitCost : ""}
                              disabled={!row.productId}
                              onChange={(e) => updateRowField(index, "unitCost", parseFloat(e.target.value) || 0)}
                              className="h-8 text-right font-mono"
                            />
                          </td>
                          <td className="py-1 px-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.productId ? row.salePrice : ""}
                              disabled={!row.productId}
                              onChange={(e) => updateRowField(index, "salePrice", parseFloat(e.target.value) || 0)}
                              className="h-8 text-right font-mono"
                            />
                          </td>
                          <td className="py-1 px-3 text-right font-mono font-medium text-muted-foreground">
                            {row.productId ? (grossAmt).toFixed(2) : "—"}
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center pt-4 border-t border-border gap-4">
              <div className="flex items-center space-x-2">
                <input id="editCatalog" type="checkbox" checked={updateCatalogCost} onChange={(e) => setUpdateCatalogCost(e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary" />
                <label htmlFor="editCatalog" className="text-[11px] text-muted-foreground font-medium">Update prices in product catalog</label>
              </div>

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
              <Button type="submit" disabled={saveMutation.isPending} className="h-9 text-xs bg-primary text-primary-foreground font-semibold px-4">
                {saveMutation.isPending ? "Saving Invoice..." : "Save Invoice"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invoice Details Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-[90vw] w-[600px] bg-card border-border select-none text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-primary" />
              Purchase Invoice Details: #{selectedVoucher?.voucherNo}
            </DialogTitle>
          </DialogHeader>

          {selectedVoucher && (
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/20 p-3 rounded border border-border/40 font-mono text-[10px] text-muted-foreground">
                <div><span className="text-foreground font-semibold">Supplier:</span> {selectedVoucher.supplierName}</div>
                <div><span className="text-foreground font-semibold">Origin Godown:</span> {selectedVoucher.godown}</div>
                <div><span className="text-foreground font-semibold">Date Received:</span> {new Date(selectedVoucher.timestamp).toLocaleString()}</div>
                <div><span className="text-foreground font-semibold">Remarks:</span> {selectedVoucher.remarks || "—"}</div>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-bold text-foreground">Stock Rows Received</h3>
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
                            <td className="py-1.5 px-3 text-right font-semibold">+{item.quantity} units</td>
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

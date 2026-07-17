"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { DataTable } from "@/components/ui/data-table";
import { getProducts, deleteProduct, getSettings, importProductsBatch } from "@/lib/ipc";
import { Product } from "@/types/storeos";
import { ProductDialog } from "@/components/features/products/product-dialog";
import { BarcodeDialog } from "@/components/features/products/barcode-dialog";
import { RefreshCw, Plus, Edit2, Trash2, Upload, Eye, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/layout/app-layout";
import { useAlerts } from "@/components/providers/alert-provider";
import { toast } from "sonner";

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const role = session?.role || "Admin";
  const { showAlert, showConfirm } = useAlerts();
  const isCashier = role === "Cashier";
  const isAuditor = role === "Auditor";
  const isReadOnly = isCashier || isAuditor;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Product | null>(null);

  // Search and pagination states to remove lag
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

  const searchParams = useSearchParams();
  const router = useRouter();

  // Excel / CSV Importer states
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Column matching & processing helper for CSV
  const processImportData = (data: any[]): any[] => {
    return data.map((row) => {
      const findValue = (possibleKeys: string[]) => {
        for (const k of Object.keys(row)) {
          const cleanK = k.toLowerCase().replace(/[\s\._-]/g, "");
          if (possibleKeys.some(pk => cleanK.includes(pk))) {
            return row[k];
          }
        }
        return undefined;
      };

      const sku = findValue(["sku", "code", "itemlist", "id"]) || "";
      const name = findValue(["name", "itemname", "description"]) || "";
      const barcode = findValue(["barcode", "upc", "ean", "serial"]) || "";
      const description = findValue(["desc", "details", "info", "memo"]) || "";
      const category = findValue(["category", "groupname", "group"]) || "General";
      const brand = findValue(["brand", "make", "manufacturer"]) || "";
      const purPrice = findValue(["purchase", "purprice", "cost", "unitcost"]) || "0";
      const salePrice = findValue(["sale", "saleprice", "retail", "price"]) || "0";
      const stock = findValue(["stock", "qty", "quantity", "onhand"]) || "0";
      const rawGst = findValue(["gst", "gstrate", "tax", "taxrate"]) || "0";
      const rawUnit = findValue(["unit", "uom", "metric"]) || "PCs";

      const cleanGstStr = String(rawGst).replace(/%/g, "").trim();
      let gstRate = parseFloat(cleanGstStr) || 0.0;
      if (gstRate > 0 && gstRate < 1) {
        gstRate = gstRate * 100;
      }

      const costCents = Math.round(parseFloat(purPrice) * 100) || 0;
      const priceCents = Math.round(parseFloat(salePrice) * 100) || 0;
      const stockQty = parseFloat(stock) || 0.0;

      return {
        sku: String(sku).trim(),
        name: String(name).trim(),
        barcode: String(barcode).trim() || undefined,
        description: String(description).trim() || undefined,
        category: String(category).trim(),
        brand: String(brand).trim() || undefined,
        priceCents,
        costCents,
        stock: stockQty,
        gstRate,
        unit: String(rawUnit).trim(),
      };
    }).filter((r) => r.sku && r.name);
  };

  // Column mapping & processing helper for Excel Rows
  const parseExcelRows = (rowsData: any[][]): any[] => {
    let headerIndex = 0;
    for (let i = 0; i < Math.min(rowsData.length, 10); i++) {
      const r = rowsData[i];
      if (r && r.some(cell => {
        const val = String(cell).toLowerCase();
        return val.includes("name") || val.includes("item") || val.includes("code");
      })) {
        headerIndex = i;
        break;
      }
    }

    const headers = rowsData[headerIndex].map(h => String(h || "").toLowerCase().replace(/[\s\._-]/g, ""));
    
    const findIndex = (possibleKeys: string[]) => {
      return headers.findIndex(h => possibleKeys.some(pk => h.includes(pk)));
    };

    const skuIdx = findIndex(["sku", "code", "itemlist", "id"]);
    const nameIdx = findIndex(["name", "itemname", "description"]);
    const barcodeIdx = findIndex(["barcode", "upc", "ean", "serial"]);
    const descIdx = findIndex(["desc", "details", "info", "memo"]);
    const catIdx = findIndex(["category", "groupname", "group"]);
    const brandIdx = findIndex(["brand", "make", "manufacturer"]);
    const purIdx = findIndex(["purchase", "purprice", "cost", "unitcost"]);
    const saleIdx = findIndex(["sale", "saleprice", "retail", "price"]);
    const stockIdx = findIndex(["stock", "qty", "quantity", "onhand"]);
    const gstIdx = findIndex(["gst", "gstrate", "tax", "taxrate"]);
    const unitIdx = findIndex(["unit", "uom", "metric"]);

    if (skuIdx === -1 || nameIdx === -1) {
      throw new Error("Could not map columns. Make sure your sheet has headers for 'Code' or 'SKU' and 'Item Name'.");
    }

    const result: any[] = [];
    for (let i = headerIndex + 1; i < rowsData.length; i++) {
      const row = rowsData[i];
      if (!row || row.length === 0) continue;

      const sku = skuIdx !== -1 ? row[skuIdx] : "";
      const name = nameIdx !== -1 ? row[nameIdx] : "";
      
      if (!sku || !name) continue;

      const barcode = barcodeIdx !== -1 ? row[barcodeIdx] : "";
      const description = descIdx !== -1 ? row[descIdx] : "";
      const category = catIdx !== -1 ? row[catIdx] : "General";
      const brand = brandIdx !== -1 ? row[brandIdx] : "";
      const purPrice = purIdx !== -1 ? row[purIdx] : "0";
      const salePrice = saleIdx !== -1 ? row[saleIdx] : "0";
      const stock = stockIdx !== -1 ? row[stockIdx] : "0";
      const rawGst = gstIdx !== -1 ? row[gstIdx] : "0";
      const rawUnit = unitIdx !== -1 ? row[unitIdx] : "PCs";

      const cleanGstStr = String(rawGst).replace(/%/g, "").trim();
      let gstRate = parseFloat(cleanGstStr) || 0.0;
      if (gstRate > 0 && gstRate < 1) {
        gstRate = gstRate * 100;
      }

      const costCents = Math.round(parseFloat(purPrice) * 100) || 0;
      const priceCents = Math.round(parseFloat(salePrice) * 100) || 0;
      const stockQty = parseFloat(stock) || 0.0;

      result.push({
        sku: String(sku).trim(),
        name: String(name).trim(),
        barcode: String(barcode).trim() || undefined,
        description: String(description).trim() || undefined,
        category: String(category).trim(),
        brand: String(brand).trim() || undefined,
        priceCents,
        costCents,
        stock: stockQty,
        gstRate,
        unit: String(rawUnit).trim(),
      });
    }

    return result;
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress("Reading file...");
    setImportError(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      if (extension === "csv") {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const text = event.target?.result as string;
            const Papa = (await import("papaparse")).default;
            
            setImportProgress("Parsing CSV structure...");
            const result = Papa.parse(text, { header: true, skipEmptyLines: true });
            
            const rows = processImportData(result.data);
            if (rows.length === 0) {
              throw new Error("No valid rows found in CSV. Check column headers.");
            }
            
            setImportProgress(`Uploading ${rows.length} items to DB...`);
            const statusMsg = await importProductsBatch(rows);
            await showAlert(statusMsg, "Import Complete", "info");
            
            queryClient.invalidateQueries({ queryKey: ["products"] });
            queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
            setImportOpen(false);
          } catch (err: any) {
            setImportError(err.message || "Failed to process CSV.");
          } finally {
            setImporting(false);
          }
        };
        reader.readAsText(file);
      } else if (extension === "xlsx" || extension === "xls") {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const buffer = event.target?.result as ArrayBuffer;
            const XLSX = await import("xlsx");
            
            setImportProgress("Reading spreadsheet sheets...");
            const data = new Uint8Array(buffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            
            if (rawJson.length <= 1) {
              throw new Error("The selected spreadsheet appears to be empty.");
            }
            
            const rows = parseExcelRows(rawJson);
            if (rows.length === 0) {
              throw new Error("No valid product rows parsed. Please check SKU and Name fields.");
            }
            
            setImportProgress(`Importing ${rows.length} products inside transaction...`);
            const statusMsg = await importProductsBatch(rows);
            await showAlert(statusMsg, "Import Complete", "info");
            
            queryClient.invalidateQueries({ queryKey: ["products"] });
            queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
            setImportOpen(false);
          } catch (err: any) {
            setImportError(err.message || "Failed to process Excel file.");
          } finally {
            setImporting(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        throw new Error("Unsupported format. Please upload .csv, .xlsx, or .xls files.");
      }
    } catch (err: any) {
      setImportError(err.message || "An unexpected error occurred.");
      setImporting(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      const params = new URLSearchParams(window.location.search);
      params.delete("action");
      const cleanSearch = params.toString();
      router.replace(`/products${cleanSearch ? `?${cleanSearch}` : ""}`);
      handleCreate();
    }
  }, [searchParams, router]);

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const idFormat = dbSettings.find((s) => s.key === "product_id_format")?.value || "sku_barcode";
  const isSerialMode = idFormat === "sku_serial";

  const { data: products = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const filteredProducts = products.filter((p) => {
    const s = debouncedSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      (p.sku && p.sku.toLowerCase().includes(s)) ||
      (p.barcode && p.barcode.toLowerCase().includes(s)) ||
      (p.category && p.category.toLowerCase().includes(s)) ||
      (p.brand && p.brand.toLowerCase().includes(s))
    );
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const displayedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      toast.success("Product Deleted", {
        description: "The product was successfully removed from the database.",
      });
    },
    onError: (err: any) => {
      toast.error("Deletion Failed", {
        description: err.message || "Could not delete the product.",
      });
    },
  });

  const handleCreate = () => {
    setSelectedProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await showConfirm("Are you sure you want to delete this product from the database?", "Delete Product");
    if (isConfirmed) {
      deleteMutation.mutate(id);
    }
  };

  const handlePrintBarcode = (product: Product) => {
    setSelectedBarcodeProduct(product);
    setBarcodeDialogOpen(true);
  };

  const columns = [
    {
      header: "Product Name",
      sortValue: (p: Product) => p.name,
      accessor: (p: Product) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded border border-border flex items-center justify-center overflow-hidden bg-muted flex-shrink-0">
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt={p.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground uppercase">{p.name.slice(0, 2)}</span>
            )}
          </div>
          <span className="font-semibold text-xs text-foreground">{p.name}</span>
        </div>
      ),
    },
    {
      header: "SKU",
      sortValue: (p: Product) => p.sku,
      accessor: (p: Product) => <span className="font-mono text-xs">{p.sku}</span>,
    },
    {
      header: isSerialMode ? "Serial Number" : "Barcode",
      sortValue: (p: Product) => p.barcode || "",
      accessor: (p: Product) => (
        <span className="font-mono text-xs text-muted-foreground">{p.barcode || "—"}</span>
      ),
    },
    {
      header: "Category",
      sortValue: (p: Product) => p.category || "",
      accessor: (p: Product) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
          {p.category || "General"}
        </span>
      ),
    },
    {
      header: "Brand",
      sortValue: (p: Product) => p.brand || "",
      accessor: (p: Product) => (
        <span className="text-xs text-muted-foreground">{p.brand || "—"}</span>
      ),
    },
    {
      header: "Retail Price",
      sortValue: (p: Product) => p.priceCents,
      accessor: (p: Product) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {(p.priceCents / 100).toLocaleString("en-US", {
            style: "currency",
            currency: currency,
          })}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Unit Cost",
      sortValue: (p: Product) => p.costCents,
      accessor: (p: Product) => (
        <span className="font-mono text-xs text-muted-foreground">
          {(p.costCents / 100).toLocaleString("en-US", {
            style: "currency",
            currency: currency,
          })}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Actions",
      accessor: (p: Product) => (
        <div className="flex gap-1.5 justify-end">
          <Button
            variant="ghost"
            onClick={() => handlePrintBarcode(p)}
            className="w-7 h-7 p-0 text-muted-foreground hover:text-primary rounded-md"
            title="Print Barcode Labels"
          >
            <Barcode className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleEdit(p)}
            className="w-7 h-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
            title={isAuditor ? "View Details" : "Edit Product"}
          >
            {isAuditor ? <Eye className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
          </Button>
          {!isCashier && !isAuditor && (
            <Button
              variant="ghost"
              onClick={() => handleDelete(p.id)}
              className="w-7 h-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-md"
              title="Delete Product"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <PageContainer
      title="Products"
      subtitle="View and manage store inventory item details"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="flex items-center gap-1.5 h-8.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 h-8.5 text-xs font-medium"
              >
                <Upload className="w-3.5 h-3.5" />
                Import CSV / Sheet
              </Button>
              <Button size="sm" className="h-8.5 text-xs font-medium flex items-center gap-1.5" onClick={handleCreate}>
                <Plus className="w-3.5 h-3.5" />
                New Product
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="max-w-md">
          <Input
            type="text"
            placeholder="Search products by name, SKU, barcode, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 text-xs bg-background/50 border-border/80 focus:bg-background"
          />
        </div>

        {isLoading ? (
          <div className="border border-border/80 rounded-lg overflow-hidden bg-card/30 select-none">
            <div className="bg-muted/30 border-b border-border/80 h-10 px-4 flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="divide-y divide-border/60">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 px-4 flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <DataTable
              columns={columns}
              data={displayedProducts}
              emptyMessage="No matching products found in the catalog."
            />
            
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredProducts.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        )}
      </div>

      <ProductDialog
        product={selectedProduct}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <BarcodeDialog
        product={selectedBarcodeProduct}
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
      />

      {/* Excel / CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[420px] bg-card border-border select-none text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-primary" />
              Import Products Catalog
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3.5">
            <p className="text-muted-foreground leading-normal">
              Select a spreadsheet (<strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong>) to import items. Your columns should contain headers matching:
            </p>
            <div className="bg-muted/30 p-3 rounded-xl border border-border/60 font-mono text-[10px] space-y-1.5 text-muted-foreground">
              <div className="flex justify-between"><span className="text-foreground font-semibold">SKU / Code:</span> <span>e.g. Code, SKU, Item List, ID</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Item Name:</span> <span>e.g. Item Name, Name</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Group / Category:</span> <span>e.g. Group Name, Category, Group</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Prices:</span> <span>e.g. Pur. Price, Sale.Price, Cost, Price</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Stock:</span> <span>e.g. Stock, Qty, Quantity, Onhand</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Barcode / Serial:</span> <span>e.g. Barcode, UPC, EAN, Serial (Optional)</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Description / Spec:</span> <span>e.g. Specification, Description, Details (Optional)</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Tax / GST Rate:</span> <span>e.g. GST Rate, Tax, GST, Tax Rate (Optional)</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Unit / UOM:</span> <span>e.g. Unit, UOM, Metric (Optional, e.g. PCs, Kgs)</span></div>
            </div>

            {importError && (
              <div className="p-2.5 text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded font-semibold">
                Error: {importError}
              </div>
            )}

            {importing ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span className="font-semibold text-muted-foreground">{importProgress}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border/70 rounded-lg p-6 hover:bg-muted/10 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleImportFile}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <span className="font-bold text-foreground">Click to upload spreadsheet file</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Supports CSV, XLSX, XLS</span>
              </div>
            )}
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
    <div className="flex items-center justify-between py-3 px-1 border-t border-border/40 text-[11px] text-muted-foreground select-none">
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

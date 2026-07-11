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
import { getSuppliers, createSupplier, deleteSupplier, importSuppliersBatch } from "@/lib/ipc";
import { Supplier } from "@/types/storeos";
import { Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useAlerts } from "@/components/providers/alert-provider";

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { showAlert, showConfirm } = useAlerts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

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

      const name = findValue(["name", "suppliername", "company", "vendor", "itemname"]) || "";
      const contactName = findValue(["contact", "contactperson", "representative", "rep", "person"]) || "";
      const email = findValue(["email", "orderemail", "supplieremail", "mail"]) || "";
      const phone = findValue(["phone", "telephone", "contactphone", "mobile", "number"]) || "";

      return {
        name: String(name).trim(),
        contactName: String(contactName).trim() || undefined,
        email: String(email).trim() || undefined,
        phone: String(phone).trim() || undefined,
      };
    }).filter((r) => r.name);
  };

  // Column mapping & processing helper for Excel Rows
  const parseExcelRows = (rowsData: any[][]): any[] => {
    let headerIndex = 0;
    for (let i = 0; i < Math.min(rowsData.length, 10); i++) {
      const r = rowsData[i];
      if (r && r.some(cell => {
        const val = String(cell).toLowerCase();
        return val.includes("name") || val.includes("supplier") || val.includes("company") || val.includes("vendor");
      })) {
        headerIndex = i;
        break;
      }
    }

    const headers = rowsData[headerIndex].map(h => String(h || "").toLowerCase().replace(/[\s\._-]/g, ""));
    
    const findIndex = (possibleKeys: string[]) => {
      return headers.findIndex(h => possibleKeys.some(pk => h.includes(pk)));
    };

    const nameIdx = findIndex(["name", "suppliername", "company", "vendor"]);
    const contactIdx = findIndex(["contact", "contactperson", "representative", "rep", "person"]);
    const emailIdx = findIndex(["email", "orderemail", "supplieremail", "mail"]);
    const phoneIdx = findIndex(["phone", "telephone", "contactphone", "mobile", "number"]);

    if (nameIdx === -1) {
      throw new Error("Could not map columns. Make sure your sheet has a header for 'Supplier Name' or 'Name'.");
    }

    const result: any[] = [];
    for (let i = headerIndex + 1; i < rowsData.length; i++) {
      const row = rowsData[i];
      if (!row || row.length === 0) continue;

      const name = nameIdx !== -1 ? row[nameIdx] : "";
      if (!name || !String(name).trim()) continue;

      const contactName = contactIdx !== -1 ? row[contactIdx] : "";
      const email = emailIdx !== -1 ? row[emailIdx] : "";
      const phone = phoneIdx !== -1 ? row[phoneIdx] : "";

      result.push({
        name: String(name).trim(),
        contactName: String(contactName).trim() || undefined,
        email: String(email).trim() || undefined,
        phone: String(phone).trim() || undefined,
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
            
            setImportProgress(`Uploading ${rows.length} suppliers to DB...`);
            const statusMsg = await importSuppliersBatch(rows);
            await showAlert(statusMsg, "Import Complete", "info");
            
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
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
              throw new Error("No valid supplier rows parsed. Please check Name fields.");
            }
            
            setImportProgress(`Importing ${rows.length} suppliers inside transaction...`);
            const statusMsg = await importSuppliersBatch(rows);
            await showAlert(statusMsg, "Import Complete", "info");
            
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
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

  const { data: suppliers = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const createMutation = useMutation({
    mutationFn: () => createSupplier(newName, newContact, newEmail, newPhone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      setNewName("");
      setNewContact("");
      setNewEmail("");
      setNewPhone("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate();
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await showConfirm("Are you sure you want to delete this supplier?", "Delete Supplier");
    if (isConfirmed) {
      deleteMutation.mutate(id);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const term = debouncedSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.contactName && s.contactName.toLowerCase().includes(term))
    );
  });

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const displayedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const columns = [
    {
      header: "Supplier Name",
      sortValue: (s: Supplier) => s.name,
      accessor: (s: Supplier) => <span className="font-semibold text-xs text-foreground">{s.name}</span>,
    },
    {
      header: "Contact Person",
      sortValue: (s: Supplier) => s.contactName || "",
      accessor: (s: Supplier) => <span className="text-xs text-muted-foreground">{s.contactName || "—"}</span>,
    },
    {
      header: "Email Address",
      sortValue: (s: Supplier) => s.email || "",
      accessor: (s: Supplier) => <span className="font-mono text-xs text-muted-foreground">{s.email || "—"}</span>,
    },
    {
      header: "Phone Number",
      sortValue: (s: Supplier) => s.phone || "",
      accessor: (s: Supplier) => <span className="font-mono text-xs text-muted-foreground">{s.phone || "—"}</span>,
    },
    {
      header: "Actions",
      accessor: (s: Supplier) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => handleDelete(s.id)}
            className="w-7 h-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-md"
            title="Delete Supplier"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <PageContainer
      title="Suppliers"
      subtitle="Manage manufacturer accounts, contact persons, and supplier directories"
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Suppliers
          </Button>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-8.5 text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Supplier
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="max-w-md">
          <Input
            type="text"
            placeholder="Search suppliers by name, contact, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 text-xs bg-background/50 border-border/80"
          />
        </div>

        {isLoading ? (
          <div className="w-full h-64 border rounded-lg animate-pulse bg-card" />
        ) : (
          <div className="space-y-4">
            <DataTable columns={columns} data={displayedSuppliers} emptyMessage="No matching suppliers found." />
            
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredSuppliers.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        )}
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[380px] bg-card border-border select-none text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-primary" />
              Add New Supplier
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="supName" className="font-semibold text-foreground">Supplier Name *</Label>
              <Input
                id="supName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Lodge Cast Iron"
                className="h-8.5 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supContact" className="font-semibold text-foreground">Contact Person</Label>
              <Input
                id="supContact"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="Contact Representative"
                className="h-8.5 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supEmail" className="font-semibold text-foreground">Order Email Address</Label>
              <Input
                id="supEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="orders@supplier.com"
                className="h-8.5 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supPhone" className="font-semibold text-foreground">Phone Number</Label>
              <Input
                id="supPhone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="123-456-7890"
                className="h-8.5 text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="h-8.5 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !newName.trim()}
                className="h-8.5 text-xs bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
              >
                {createMutation.isPending ? "Adding..." : "Add Supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excel / CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[420px] bg-card border-border select-none text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-primary" />
              Import Suppliers Directory
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3.5">
            <p className="text-muted-foreground leading-normal">
              Select a spreadsheet (<strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong>) to import supplier records. Your columns should contain headers matching:
            </p>
            <div className="bg-muted/30 p-3 rounded-xl border border-border/60 font-mono text-[10px] space-y-1.5 text-muted-foreground">
              <div className="flex justify-between"><span className="text-foreground font-semibold">Supplier Name:</span> <span>e.g. Supplier Name, Name, Company, Vendor</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Contact Person:</span> <span>e.g. Contact Person, Contact, Representative, Rep (Optional)</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Email:</span> <span>e.g. Email, Order Email, Mail (Optional)</span></div>
              <div className="flex justify-between"><span className="text-foreground font-semibold">Phone:</span> <span>e.g. Phone, Telephone, Mobile, Number (Optional)</span></div>
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
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-8 h-8 text-muted-foreground/60 mb-2" />
                <span className="font-semibold text-foreground">Click to upload spreadsheet</span>
                <span className="text-[10px] text-muted-foreground mt-1">Supports CSV, XLSX, XLS files</span>
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

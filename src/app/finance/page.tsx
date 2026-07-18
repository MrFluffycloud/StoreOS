"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getAccounts,
  createAccount,
  getAccountLedger,
  getJournalEntries,
  createManualJournalEntry,
  updateManualJournalEntry,
  deleteJournalEntry,
  getBalanceSheet,
  getProfitLoss,
  getSettings,
  Account,
  AccountLedgerDetails,
} from "@/lib/ipc";
import {
  BookOpen,
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Scale,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingDown,
  X,
  Layers,
  ListFilter,
  FolderPlus,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/layout/app-layout";

export default function FinancePage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const role = session?.role || "Admin";

  const [activeTab, setActiveTab] = useState<"sheets" | "coa" | "drilldown" | "journal">("sheets");
  const [activeSheet, setActiveSheet] = useState<"balance" | "pl">("balance");
  const [selectedLedgerCode, setSelectedLedgerCode] = useState<string>("1010");
  
  // Modals
  const [journalModalOpen, setJournalModalOpen] = useState(false);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [coaSearch, setCoaSearch] = useState("");
  const [coaTypeFilter, setCoaTypeFilter] = useState<string>("All");
  const [drillSearch, setDrillSearch] = useState("");

  // Create Account Form States
  const [newAcctCode, setNewAcctCode] = useState("");
  const [newAcctName, setNewAcctName] = useState("");
  const [newAcctType, setNewAcctType] = useState<"Asset" | "Liability" | "Equity" | "Revenue" | "Expense">("Asset");

  // Manual Journal Entry Form States
  const [entryRefType, setEntryRefType] = useState("Adjustment");
  const [entryRefId, setEntryRefId] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [items, setItems] = useState<Array<{ accountCode: string; debit: string; credit: string }>>([
    { accountCode: "", debit: "", credit: "" },
    { accountCode: "", debit: "", credit: "" },
  ]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Queries
  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  const { data: ledgerDetails = null, isLoading: loadingLedger } = useQuery({
    queryKey: ["accountLedger", selectedLedgerCode],
    queryFn: () => getAccountLedger(selectedLedgerCode),
    enabled: !!selectedLedgerCode,
  });

  const { data: journalEntries = [], isLoading: loadingJournals } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: getJournalEntries,
  });

  const { data: balanceSheet = null, isLoading: loadingBalance } = useQuery({
    queryKey: ["balanceSheet"],
    queryFn: getBalanceSheet,
  });

  const { data: profitLoss = null, isLoading: loadingPL } = useQuery({
    queryKey: ["profitLoss"],
    queryFn: getProfitLoss,
  });

  // Format Helper
  const formatCents = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency,
    });
  };

  // Double-entry auto balance calculation
  const totalDebits = items.reduce((acc, it) => acc + (parseFloat(it.debit || "0") || 0), 0);
  const totalCredits = items.reduce((acc, it) => acc + (parseFloat(it.credit || "0") || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
  const difference = Math.abs(totalDebits - totalCredits);

  const handleAutoBalance = () => {
    if (isBalanced || items.length === 0) return;
    const diff = totalDebits - totalCredits;
    const newItems = [...items];
    const lastIdx = newItems.length - 1;
    if (diff > 0) {
      const currentVal = parseFloat(newItems[lastIdx].credit || "0") || 0;
      newItems[lastIdx].credit = (currentVal + diff).toFixed(2);
      newItems[lastIdx].debit = "";
    } else {
      const currentVal = parseFloat(newItems[lastIdx].debit || "0") || 0;
      newItems[lastIdx].debit = (currentVal - diff).toFixed(2);
      newItems[lastIdx].credit = "";
    }
    setItems(newItems);
    toast.success("Ledger balanced automatically.");
  };

  // Account Creation Mutation
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      if (!newAcctCode.trim() || !newAcctName.trim()) {
        throw new Error("Account code and account name are required.");
      }
      return await createAccount({
        code: newAcctCode.trim(),
        name: newAcctName.trim(),
        type: newAcctType,
      });
    },
    onSuccess: (createdAcct) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["balanceSheet"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
      queryClient.invalidateQueries({ queryKey: ["accountLedger", createdAcct.code] });

      setCreateAccountModalOpen(false);
      setSelectedLedgerCode(createdAcct.code);
      setNewAcctCode("");
      setNewAcctName("");
      setNewAcctType("Asset");

      toast.success(`Ledger account '${createdAcct.code} - ${createdAcct.name}' created successfully.`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create ledger account.");
    },
  });

  // Manual Journal Mutations
  const createJournalMutation = useMutation({
    mutationFn: async () => {
      const preparedItems = items.map((it) => {
        const debitCents = Math.round(parseFloat(it.debit || "0") * 100);
        const creditCents = Math.round(parseFloat(it.credit || "0") * 100);
        return {
          accountCode: it.accountCode,
          debitCents,
          creditCents,
        };
      });

      const sumDebits = preparedItems.reduce((acc, x) => acc + x.debitCents, 0);
      const sumCredits = preparedItems.reduce((acc, x) => acc + x.creditCents, 0);

      if (sumDebits !== sumCredits) {
        throw new Error(`Double-entry transaction must balance. Total debits (${formatCents(sumDebits)}) must equal total credits (${formatCents(sumCredits)}).`);
      }

      if (preparedItems.some((x) => !x.accountCode)) {
        throw new Error("All journal transaction rows must specify an account code.");
      }

      if (editingEntryId) {
        await updateManualJournalEntry(editingEntryId, {
          referenceType: entryRefType,
          referenceId: entryRefId,
          description: entryDesc || undefined,
          items: preparedItems,
        });
      } else {
        await createManualJournalEntry({
          referenceType: entryRefType,
          referenceId: entryRefId || `MAN-${Date.now().toString().slice(-6)}`,
          description: entryDesc || undefined,
          items: preparedItems,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["balanceSheet"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
      queryClient.invalidateQueries({ queryKey: ["accountLedger"] });
      
      setJournalModalOpen(false);
      setEditingEntryId(null);
      setEntryRefType("Adjustment");
      setEntryRefId("");
      setEntryDesc("");
      setItems([
        { accountCode: "", debit: "", credit: "" },
        { accountCode: "", debit: "", credit: "" },
      ]);
      
      toast.success(editingEntryId ? "Ledger entry updated successfully." : "Double-entry journal transaction posted successfully.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to post journal entry.");
    },
  });

  const deleteJournalMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteJournalEntry(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["balanceSheet"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
      queryClient.invalidateQueries({ queryKey: ["accountLedger"] });
      toast.success("Ledger journal entry deleted successfully.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete ledger entry.");
    },
  });

  // Filtering CoA list
  const filteredCoA = accounts.filter((a) => {
    const q = coaSearch.toLowerCase();
    const matchesQuery = a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    const matchesType = coaTypeFilter === "All" || a.type === coaTypeFilter;
    return matchesQuery && matchesType;
  });

  // Filtered Journals List
  const filteredJournals = journalEntries.filter((entry) => {
    const q = searchQuery.toLowerCase();
    const entryDescMatch = entry.description?.toLowerCase().includes(q) || false;
    const entryRefMatch = entry.referenceId.toLowerCase().includes(q) || entry.referenceType.toLowerCase().includes(q);
    const itemMatch = entry.items.some(
      (it: any) =>
        it.accountName.toLowerCase().includes(q) ||
        it.accountCode.includes(q)
    );
    return entryDescMatch || entryRefMatch || itemMatch;
  });

  // Filtered Drilldown Transactions
  const filteredDrilldownTx = (ledgerDetails?.transactions || []).filter((tx) => {
    const q = drillSearch.toLowerCase();
    return (
      tx.referenceId.toLowerCase().includes(q) ||
      tx.referenceType.toLowerCase().includes(q) ||
      (tx.description && tx.description.toLowerCase().includes(q))
    );
  });

  // Auto Code Suggestion Helper
  const suggestCode = (type: string) => {
    const prefixes: Record<string, string> = {
      Asset: "10",
      Liability: "20",
      Equity: "30",
      Revenue: "40",
      Expense: "60",
    };
    const prefix = prefixes[type] || "10";
    const existing = accounts.filter((a) => a.code.startsWith(prefix));
    if (existing.length === 0) return `${prefix}10`;
    const maxCode = Math.max(...existing.map((a) => parseInt(a.code, 10) || 0));
    return (maxCode + 10).toString();
  };

  // Account Type Badge Helper
  const getTypeBadge = (type: string) => {
    switch (type) {
      case "Asset":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Asset (Debit Normal)</span>;
      case "Liability":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">Liability (Credit Normal)</span>;
      case "Equity":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">Equity (Credit Normal)</span>;
      case "Revenue":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">Revenue (Credit Normal)</span>;
      case "Expense":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">Expense (Debit Normal)</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">{type}</span>;
    }
  };

  // Access checks
  if (role === "Cashier") {
    return (
      <PageContainer title="Finance & Ledger" subtitle="Access Restricted">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Access Restricted</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Your Cashier account does not have permission to view general ledger audit records or balance sheet summaries.
          </p>
        </div>
      </PageContainer>
    );
  }

  const selectedAccountObj = accounts.find((a) => a.code === selectedLedgerCode);

  return (
    <PageContainer
      title="Finance & General Ledger"
      subtitle="Chart of accounts management, ledger account drill-downs, double-entry financial reporting, and audit logs."
    >
      {/* Upper Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-border/80 pb-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-card p-1.5 rounded-xl border border-border shadow-xs">
          <button
            onClick={() => setActiveTab("sheets")}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 tracking-wider ${
              activeTab === "sheets"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Financial Statements</span>
          </button>

          <button
            onClick={() => setActiveTab("coa")}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 tracking-wider ${
              activeTab === "coa"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Chart of Accounts</span>
          </button>

          <button
            onClick={() => setActiveTab("drilldown")}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 tracking-wider ${
              activeTab === "drilldown"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Account Ledger Drill-Down</span>
            {selectedAccountObj && (
              <span
                className={`ml-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors ${
                  activeTab === "drilldown"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-foreground font-semibold border border-border/70"
                }`}
              >
                {selectedAccountObj.code}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("journal")}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 tracking-wider ${
              activeTab === "journal"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Journal Entries</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {role === "Admin" && (
            <Button
              onClick={() => {
                setNewAcctCode(suggestCode("Asset"));
                setNewAcctName("");
                setNewAcctType("Asset");
                setCreateAccountModalOpen(true);
              }}
              className="flex items-center gap-2 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Ledger Account</span>
            </Button>
          )}

          {activeTab === "journal" && role === "Admin" && (
            <Button
              onClick={() => {
                setEditingEntryId(null);
                setEntryRefType("Adjustment");
                setEntryRefId("");
                setEntryDesc("");
                setItems([
                  { accountCode: "", debit: "", credit: "" },
                  { accountCode: "", debit: "", credit: "" },
                ]);
                setJournalModalOpen(true);
              }}
              className="flex items-center gap-2 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Post Adjustment Entry</span>
            </Button>
          )}
        </div>
      </div>

      {/* Financial Statements View */}
      {activeTab === "sheets" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveSheet("balance")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                  activeSheet === "balance"
                    ? "bg-card border-border text-foreground shadow-xs"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                }`}
              >
                Balance Sheet
              </button>
              <button
                onClick={() => setActiveSheet("pl")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                  activeSheet === "pl"
                    ? "bg-card border-border text-foreground shadow-xs"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                }`}
              >
                Profit & Loss (P&L)
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground italic hidden sm:block">
              💡 Tip: Click any account row below to drill down into its detailed transaction ledger!
            </p>
          </div>

          {/* Balance Sheet Statements */}
          {activeSheet === "balance" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Assets Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                  <h3 className="text-sm font-bold text-foreground">Assets (Debit Accounts)</h3>
                  <span className="text-xs font-bold text-primary">Debit Normal</span>
                </div>
                <Card className="bg-card border border-border shadow-xs overflow-hidden">
                  <CardContent className="p-0">
                    <table className="w-full text-xs text-left">
                      <tbody>
                        {loadingBalance ? (
                          <tr><td className="p-4 animate-pulse">Computing assets balance ledger...</td></tr>
                        ) : balanceSheet?.assets.map((acct: any) => (
                          <tr
                            key={acct.code}
                            onClick={() => {
                              setSelectedLedgerCode(acct.code);
                              setActiveTab("drilldown");
                            }}
                            className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-all group"
                            title="Click to view detailed account ledger"
                          >
                            <td className="py-3.5 px-4 font-mono text-[11px] text-muted-foreground w-20 group-hover:text-primary font-bold">{acct.code}</td>
                            <td className="py-3.5 px-4 text-foreground font-semibold flex items-center gap-2">
                              <span>{acct.name}</span>
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">{formatCents(acct.balanceCents)}</td>
                          </tr>
                        ))}
                        {!loadingBalance && (
                          <tr className="bg-muted/60 font-bold">
                            <td className="py-3.5 px-4" colSpan={2}>Total Assets</td>
                            <td className="py-3.5 px-4 text-right font-mono text-primary text-sm">
                              {balanceSheet ? formatCents(balanceSheet.totalAssetsCents) : "$0.00"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              {/* Liabilities & Equity Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                  <h3 className="text-sm font-bold text-foreground">Liabilities & Equity (Credit Accounts)</h3>
                  <span className="text-xs font-bold text-amber-500">Credit Normal</span>
                </div>
                <Card className="bg-card border border-border shadow-xs overflow-hidden">
                  <CardContent className="p-0">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                        <tr>
                          <th className="py-2.5 px-4" colSpan={2}>Liabilities</th>
                          <th className="py-2.5 px-4 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingBalance ? (
                          <tr><td className="p-4 animate-pulse">Computing liabilities...</td></tr>
                        ) : balanceSheet?.liabilities.length === 0 ? (
                          <tr><td className="p-4 text-muted-foreground italic text-center" colSpan={3}>No outstanding liability balances.</td></tr>
                        ) : balanceSheet?.liabilities.map((acct: any) => (
                          <tr
                            key={acct.code}
                            onClick={() => {
                              setSelectedLedgerCode(acct.code);
                              setActiveTab("drilldown");
                            }}
                            className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-all group"
                            title="Click to view detailed account ledger"
                          >
                            <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground w-20 group-hover:text-primary font-bold">{acct.code}</td>
                            <td className="py-2.5 px-4 text-foreground font-medium flex items-center gap-2">
                              <span>{acct.name}</span>
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">{formatCents(acct.balanceCents)}</td>
                          </tr>
                        ))}
                        {!loadingBalance && (
                          <tr className="bg-muted/40 font-bold border-b border-border">
                            <td className="py-2.5 px-4" colSpan={2}>Total Liabilities</td>
                            <td className="py-2.5 px-4 text-right font-mono text-foreground font-semibold">
                              {balanceSheet ? formatCents(balanceSheet.totalLiabilitiesCents) : "$0.00"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                        <tr>
                          <th className="py-2.5 px-4" colSpan={2}>Equity & Earnings</th>
                          <th className="py-2.5 px-4 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingBalance ? (
                          <tr><td className="p-4 animate-pulse">Computing equity...</td></tr>
                        ) : balanceSheet?.equity.map((acct: any) => (
                          <tr
                            key={acct.code}
                            onClick={() => {
                              setSelectedLedgerCode(acct.code);
                              setActiveTab("drilldown");
                            }}
                            className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-all group"
                            title="Click to view detailed account ledger"
                          >
                            <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground w-20 group-hover:text-primary font-bold">{acct.code}</td>
                            <td className="py-2.5 px-4 text-foreground font-medium flex items-center gap-2">
                              <span>{acct.name}</span>
                              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">{formatCents(acct.balanceCents)}</td>
                          </tr>
                        ))}
                        {!loadingBalance && (
                          <tr className="bg-muted/40 font-bold border-b border-border">
                            <td className="py-2.5 px-4" colSpan={2}>Total Equity</td>
                            <td className="py-2.5 px-4 text-right font-mono text-foreground font-semibold">
                              {balanceSheet ? formatCents(balanceSheet.totalEquityCents) : "$0.00"}
                            </td>
                          </tr>
                        )}
                        {!loadingBalance && (
                          <tr className="bg-muted/60 font-bold">
                            <td className="py-3 px-4" colSpan={2}>Total Liabilities & Equity</td>
                            <td className="py-3 px-4 text-right font-mono text-amber-500 text-sm">
                              {balanceSheet ? formatCents(balanceSheet.totalLiabilitiesCents + balanceSheet.totalEquityCents) : "$0.00"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {!loadingBalance && balanceSheet && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                    balanceSheet.totalAssetsCents === (balanceSheet.totalLiabilitiesCents + balanceSheet.totalEquityCents)
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-450"
                  }`}>
                    {balanceSheet.totalAssetsCents === (balanceSheet.totalLiabilitiesCents + balanceSheet.totalEquityCents) ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-500" />
                        <span className="text-xs font-semibold">
                          Reconciliation Balanced: Double-entry matches perfectly (Assets = Liabilities + Equity).
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
                        <span className="text-xs font-semibold">
                          Warning: System imbalance detected (Assets != Liabilities + Equity). Review manual entries or check system logs.
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Profit & Loss Statement */}
          {activeSheet === "pl" && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between border-b border-border/80 pb-2">
                <h3 className="text-sm font-bold text-foreground">Statement of Profit & Loss (YTD)</h3>
                <span className="text-xs font-bold text-muted-foreground">Cumulative Report</span>
              </div>

              <Card className="bg-card border border-border shadow-xs overflow-hidden rounded-xl">
                <CardContent className="p-0">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                      <tr>
                        <th className="py-2.5 px-4" colSpan={2}>Revenue / Operating Income</th>
                        <th className="py-2.5 px-4 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingPL ? (
                        <tr><td className="p-4 animate-pulse">Computing Revenues...</td></tr>
                      ) : profitLoss?.revenues.length === 0 ? (
                        <tr><td className="p-3 text-muted-foreground italic text-center" colSpan={3}>No revenues recorded.</td></tr>
                      ) : profitLoss?.revenues.map((acct: any) => (
                        <tr
                          key={acct.code}
                          onClick={() => {
                            setSelectedLedgerCode(acct.code);
                            setActiveTab("drilldown");
                          }}
                          className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-all group"
                          title="Click to view detailed account ledger"
                        >
                          <td className="py-2.5 px-4 font-mono text-muted-foreground w-20 group-hover:text-primary font-bold">{acct.code}</td>
                          <td className="py-2.5 px-4 text-foreground font-medium flex items-center gap-2">
                            <span>{acct.name}</span>
                            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-foreground">{formatCents(acct.balanceCents)}</td>
                        </tr>
                      ))}
                      {!loadingPL && (
                        <tr className="bg-muted/40 font-bold border-b border-border">
                          <td className="py-2.5 px-4" colSpan={2}>Total Operating Revenue</td>
                          <td className="py-2.5 px-4 text-right font-mono text-foreground font-semibold">
                            {profitLoss ? formatCents(profitLoss.totalRevenueCents) : "$0.00"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                      <tr>
                        <th className="py-2.5 px-4" colSpan={2}>Direct & Operating Expenses</th>
                        <th className="py-2.5 px-4 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingPL ? (
                        <tr><td className="p-4 animate-pulse">Computing expenses...</td></tr>
                      ) : profitLoss?.expenses.length === 0 ? (
                        <tr><td className="p-3 text-muted-foreground italic text-center" colSpan={3}>No expenses logged.</td></tr>
                      ) : profitLoss?.expenses.map((acct: any) => (
                        <tr
                          key={acct.code}
                          onClick={() => {
                            setSelectedLedgerCode(acct.code);
                            setActiveTab("drilldown");
                          }}
                          className="border-b border-border/40 hover:bg-primary/5 cursor-pointer transition-all group"
                          title="Click to view detailed account ledger"
                        >
                          <td className="py-2.5 px-4 font-mono text-muted-foreground w-20 group-hover:text-primary font-bold">{acct.code}</td>
                          <td className="py-2.5 px-4 text-foreground font-medium flex items-center gap-2">
                            <span>{acct.name}</span>
                            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-foreground">{formatCents(acct.balanceCents)}</td>
                        </tr>
                      ))}
                      {!loadingPL && (
                        <tr className="bg-muted/40 font-bold border-b border-border">
                          <td className="py-2.5 px-4" colSpan={2}>Total Direct Expenses</td>
                          <td className="py-2.5 px-4 text-right font-mono text-foreground font-semibold">
                            {profitLoss ? formatCents(profitLoss.totalExpenseCents) : "$0.00"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div className="bg-muted/80 p-4 flex items-center justify-between font-bold border-t border-border">
                    <span className="text-xs text-foreground uppercase tracking-wider font-extrabold">Net Income / Earnings</span>
                    <span className={`font-mono text-base font-black ${
                      profitLoss && profitLoss.netIncomeCents >= 0 ? "text-emerald-500 animate-pulse" : "text-rose-500"
                    }`}>
                      {profitLoss ? formatCents(profitLoss.netIncomeCents) : "$0.00"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Chart of Accounts Tab */}
      {activeTab === "coa" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
            <div className="flex items-center gap-2 bg-background border border-border px-3 py-1.5 rounded-lg max-w-sm flex-1">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={coaSearch}
                onChange={(e) => setCoaSearch(e.target.value)}
                placeholder="Search Chart of Accounts by code or name..."
                className="w-full bg-transparent border-none text-xs text-foreground focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {["All", "Asset", "Liability", "Equity", "Revenue", "Expense"].map((type) => (
                <button
                  key={type}
                  onClick={() => setCoaTypeFilter(type)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                    coaTypeFilter === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <Card className="bg-card border border-border overflow-hidden rounded-xl shadow-xs">
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4 w-28">Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Account Classification</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredCoA.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground italic">
                        No ledger accounts match search query.
                      </td>
                    </tr>
                  ) : (
                    filteredCoA.map((acct) => (
                      <tr key={acct.code} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-foreground text-xs">{acct.code}</td>
                        <td className="py-3 px-4 font-semibold text-foreground">{acct.name}</td>
                        <td className="py-3 px-4">{getTypeBadge(acct.type)}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedLedgerCode(acct.code);
                              setActiveTab("drilldown");
                            }}
                            className="h-7 text-[11px] font-bold border-border bg-background hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-1.5 ml-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Drill-Down Ledger</span>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Account Ledger Drill-Down Tab */}
      {activeTab === "drilldown" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Account Selector Bar */}
          <div className="bg-card border border-border p-4 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Active Account Ledger</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedLedgerCode}
                    onChange={(e) => setSelectedLedgerCode(e.target.value)}
                    className="text-sm font-black text-foreground bg-background border border-border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary focus:outline-hidden"
                  >
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                  {ledgerDetails && getTypeBadge(ledgerDetails.account.type)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-background border border-border px-3 py-1.5 rounded-lg max-w-xs w-full sm:w-auto">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={drillSearch}
                onChange={(e) => setDrillSearch(e.target.value)}
                placeholder="Search ledger entries..."
                className="w-full bg-transparent border-none text-xs text-foreground focus:outline-hidden"
              />
            </div>
          </div>

          {/* Stat Summary Cards */}
          {loadingLedger ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-24 bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : ledgerDetails ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border border-border shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Current Ledger Balance</span>
                    <h3 className="text-xl font-black text-foreground font-mono mt-0.5">
                      {formatCents(ledgerDetails.currentBalanceCents)}
                    </h3>
                  </div>
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                    <Scale className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border border-border shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Cumulative Debits</span>
                    <h3 className="text-xl font-black text-foreground font-mono mt-0.5">
                      {formatCents(ledgerDetails.totalDebitCents)}
                    </h3>
                  </div>
                  <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border border-border shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Cumulative Credits</span>
                    <h3 className="text-xl font-black text-foreground font-mono mt-0.5">
                      {formatCents(ledgerDetails.totalCreditCents)}
                    </h3>
                  </div>
                  <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
                    <ArrowDownRight className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Detailed Ledger Transactions Table */}
          <Card className="bg-card border border-border overflow-hidden rounded-xl shadow-xs">
            <CardHeader className="py-3 px-4 bg-muted/30 border-b border-border flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <span>Detailed Transaction History</span>
                <span className="text-muted-foreground font-mono text-[11px] font-normal">
                  ({filteredDrilldownTx.length} items logged)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Reference Voucher</th>
                    <th className="py-3 px-4">Description / Memo</th>
                    <th className="py-3 px-4 text-right">Debit</th>
                    <th className="py-3 px-4 text-right">Credit</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loadingLedger ? (
                    <tr><td colSpan={6} className="p-6 text-center animate-pulse">Loading detailed ledger drill-down...</td></tr>
                  ) : filteredDrilldownTx.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                        No transactions recorded for account {selectedLedgerCode} - {selectedAccountObj?.name || "Selected Account"}.
                      </td>
                    </tr>
                  ) : (
                    filteredDrilldownTx.map((tx) => (
                      <tr key={tx.id} className="hover:bg-muted/15 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(tx.timestamp).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground">{tx.referenceType}</span>
                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                              {tx.referenceId}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-foreground font-medium">
                          {tx.description || <span className="text-muted-foreground italic">No memo</span>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-500">
                          {tx.debitCents > 0 ? formatCents(tx.debitCents) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-450">
                          {tx.creditCents > 0 ? formatCents(tx.creditCents) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-foreground bg-muted/20">
                          {formatCents(tx.runningBalanceCents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Journal entries log tab */}
      {activeTab === "journal" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-card border border-border p-3 rounded-xl flex items-center gap-3 max-w-lg shadow-inner">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by account code, name, voucher, or description..."
              className="w-full bg-transparent border-none text-xs text-foreground focus:outline-hidden"
            />
          </div>

          <div className="space-y-4">
            {loadingJournals ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="h-28 bg-card border border-border animate-pulse" />
                ))}
              </div>
            ) : filteredJournals.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs bg-card border border-border rounded-xl italic">
                No ledger journal transactions found matching criteria.
              </div>
            ) : (
              filteredJournals.map((entry) => (
                <Card key={entry.id} className="bg-card border border-border overflow-hidden rounded-xl hover:shadow-md transition-all">
                  <div className="bg-muted/65 px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">{entry.referenceType} Entry</span>
                      <span className="font-mono text-muted-foreground text-[10px]">Ref: {entry.referenceId}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(entry.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {role === "Admin" && (
                        <div className="flex items-center gap-1.5 border-l border-border/80 pl-3">
                          <button
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setEntryRefType(entry.referenceType);
                              setEntryRefId(entry.referenceId);
                              setEntryDesc(entry.description || "");
                              setItems(
                                entry.items.map((it: any) => ({
                                  accountCode: it.accountCode,
                                  debit: it.debitCents > 0 ? (it.debitCents / 100).toString() : "",
                                  credit: it.creditCents > 0 ? (it.creditCents / 100).toString() : "",
                                }))
                              );
                              setJournalModalOpen(true);
                            }}
                            className="text-[10px] font-bold text-primary hover:underline hover:text-primary/80 transition-colors"
                          >
                            Edit
                          </button>
                          <span className="text-muted-foreground/30">•</span>
                          <button
                            onClick={() => {
                              if (confirm("Are you sure you want to permanently delete this journal entry? This will reverse its effect on the balance sheet and profit & loss statements.")) {
                                deleteJournalMutation.mutate(entry.id);
                              }
                            }}
                            disabled={deleteJournalMutation.isPending}
                            className="text-[10px] font-bold text-rose-500 hover:underline hover:text-rose-450 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-0">
                    <div className="px-4 py-2.5 text-[11px] text-muted-foreground bg-background/40 border-b border-border/40 italic">
                      Memo: {entry.description || "No memo details provided."}
                    </div>
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                        <tr>
                          <th className="py-2 px-4">Account Code</th>
                          <th className="py-2 px-4">Ledger Account</th>
                          <th className="py-2 px-4 text-right">Debit</th>
                          <th className="py-2 px-4 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {entry.items.map((it: any) => (
                          <tr key={it.id} className="hover:bg-muted/10 transition-colors">
                            <td className="py-2 px-4 font-mono text-[10px] text-muted-foreground w-28">{it.accountCode}</td>
                            <td className="py-2 px-4 font-medium text-foreground">{it.accountName}</td>
                            <td className="py-2 px-4 text-right font-mono font-semibold text-foreground">
                              {it.debitCents > 0 ? formatCents(it.debitCents) : ""}
                            </td>
                            <td className="py-2 px-4 text-right font-mono font-semibold text-foreground">
                              {it.creditCents > 0 ? formatCents(it.creditCents) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create Account Modal Dialog */}
      <Dialog open={createAccountModalOpen} onOpenChange={setCreateAccountModalOpen}>
        <DialogContent className="bg-card border border-border max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-emerald-500" />
              <span>Create New Ledger Account</span>
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAccountMutation.mutate();
            }}
            className="space-y-4 pt-2 text-xs"
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Account Type (Classification)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                value={newAcctType}
                onChange={(e) => {
                  const selectedType = e.target.value as any;
                  setNewAcctType(selectedType);
                  setNewAcctCode(suggestCode(selectedType));
                }}
              >
                <option value="Asset">Asset (Debit Normal - Cash, Bank, Inventory)</option>
                <option value="Liability">Liability (Credit Normal - Accounts Payable, Loans)</option>
                <option value="Equity">Equity (Credit Normal - Owner's Equity, Capital)</option>
                <option value="Revenue">Revenue (Credit Normal - Sales, Service Income)</option>
                <option value="Expense">Expense (Debit Normal - Rent, Salaries, Utilities)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Account Code (Unique Numeric ID)</Label>
              <Input
                value={newAcctCode}
                onChange={(e) => setNewAcctCode(e.target.value)}
                placeholder="e.g. 1030 or 6200"
                className="h-9 text-xs bg-background border-border font-mono"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Account Name</Label>
              <Input
                value={newAcctName}
                onChange={(e) => setNewAcctName(e.target.value)}
                placeholder="e.g. Petty Cash, Rent Expense, Consulting Revenue"
                className="h-9 text-xs bg-background border-border"
                required
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateAccountModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                disabled={createAccountMutation.isPending}
              >
                Create Account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual Entry dialog modal */}
      <Dialog open={journalModalOpen} onOpenChange={setJournalModalOpen}>
        <DialogContent className="bg-card border border-border max-w-2xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Post Manual Double-Entry Journal Adjustment</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createJournalMutation.mutate();
            }}
            className="space-y-4 pt-2 text-xs"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Voucher Reference Type</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                  value={entryRefType}
                  onChange={(e) => setEntryRefType(e.target.value)}
                >
                  <option value="Adjustment">Adjustment</option>
                  <option value="Capital">Capital Contribution</option>
                  <option value="Expense">Expense Payment</option>
                  <option value="Payroll">Payroll Payout</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Voucher Reference ID</Label>
                <Input
                  value={entryRefId}
                  onChange={(e) => setEntryRefId(e.target.value)}
                  placeholder="e.g. ADJ-0045"
                  className="h-9 text-xs bg-background border-border"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Voucher Memo / Description</Label>
              <Input
                value={entryDesc}
                onChange={(e) => setEntryDesc(e.target.value)}
                placeholder="Brief reason for journal adjustment..."
                className="h-9 text-xs bg-background border-border"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <Label className="text-xs font-bold text-foreground">Transaction Entries (Ledger Sheet)</Label>
                {!isBalanced && (
                  <Button
                    type="button"
                    onClick={handleAutoBalance}
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 font-semibold px-2 flex items-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3 h-3 animate-pulse" /> Auto-Balance Ledger
                  </Button>
                )}
              </div>
              
              <div className="border border-border rounded-xl overflow-hidden bg-background/50">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Ledger Account</th>
                      <th className="py-2.5 px-3 w-28 text-right">Debit</th>
                      <th className="py-2.5 px-3 w-28 text-right">Credit</th>
                      <th className="py-2.5 px-3 w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/45">
                    {items.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/10 transition-colors">
                        <td className="p-2">
                          <select
                            className="flex h-8.5 w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                            value={row.accountCode}
                            onChange={(e) => {
                              const newRows = [...items];
                              newRows[idx].accountCode = e.target.value;
                              setItems(newRows);
                            }}
                            required
                          >
                            <option value="">-- Choose Account --</option>
                            {accounts.map((acct) => (
                              <option key={acct.code} value={acct.code}>
                                {acct.code} - {acct.name} ({acct.type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={row.debit}
                            onChange={(e) => {
                              const newRows = [...items];
                              newRows[idx].debit = e.target.value;
                              if (e.target.value) newRows[idx].credit = "";
                              setItems(newRows);
                            }}
                            className="h-8.5 text-xs font-mono bg-background border-border text-right"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={row.credit}
                            onChange={(e) => {
                              const newRows = [...items];
                              newRows[idx].credit = e.target.value;
                              if (e.target.value) newRows[idx].debit = "";
                              setItems(newRows);
                            }}
                            className="h-8.5 text-xs font-mono bg-background border-border text-right"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {items.length > 2 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-450 hover:bg-rose-500/10 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/40 font-bold border-t border-border">
                    <tr className="font-mono text-xs">
                      <td className="py-2.5 px-3 text-right text-muted-foreground uppercase text-[10px] tracking-wider">Total Ledger Debits / Credits</td>
                      <td className="py-2.5 px-3 text-right text-foreground font-black">${totalDebits.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-foreground font-black">${totalCredits.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`w-2 h-2 rounded-full inline-block ${
                          isBalanced ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                        }`} title={isBalanced ? "Balanced" : "Unbalanced"} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-between items-center pt-1.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setItems([...items, { accountCode: "", debit: "", credit: "" }])}
                  className="text-[10px] h-8 border-border hover:bg-muted bg-transparent flex items-center justify-center gap-1.5 px-3 font-semibold rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line Entry</span>
                </Button>

                {!isBalanced && (
                  <div className="flex items-center gap-1.5 text-[10px] text-rose-450 font-bold bg-rose-500/5 px-2.5 py-1 rounded-md border border-rose-500/10">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Unbalanced Diff: ${difference.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setJournalModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95" disabled={createJournalMutation.isPending}>
                Post Ledger Entry
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

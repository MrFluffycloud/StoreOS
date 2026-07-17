"use client";

import { useState, useEffect } from "react";
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
  getEmployees,
  createEmployee,
  updateEmployee,
  getAttendanceLogs,
  clockInOut,
  listPayrollRuns,
  generatePayrollRun,
  payPayrollRun,
  getSettings,
  getUsers,
  setSetting,
  runAutoPayroll,
} from "@/lib/ipc";
import {
  Users,
  Calendar,
  DollarSign,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Clock3,
  CreditCard,
  UserPlus,
  RefreshCw,
  Search,
  Mail,
  Phone,
  Briefcase,
  Percent,
  ChevronRight,
  TrendingUp,
  Filter,
  X,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/layout/app-layout";

export default function HrPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const role = session?.role || "Admin";

  const [activeTab, setActiveTab] = useState<"directory" | "attendance" | "payroll">("directory");
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  
  // Real-time ticking clock for attendance terminal
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Create Employee Form States
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empSalary, setEmpSalary] = useState("");
  const [empCommission, setEmpCommission] = useState("");
  const [empUserId, setEmpUserId] = useState("");
  const [empPayType, setEmpPayType] = useState("Monthly");

  // Edit Employee Form States
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [editCommission, setEditCommission] = useState("");
  const [editPayType, setEditPayType] = useState("Monthly");
  const [editStatus, setEditStatus] = useState("Active");

  // Attendance Filter States
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Payroll Form States
  const [payrollModalOpen, setPayrollModalOpen] = useState(false);
  const [payrollEmployeeId, setPayrollEmployeeId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Queries
  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const getCurrencySymbol = (code: string) => {
    switch (code.toUpperCase()) {
      case "INR": return "₹";
      case "EUR": return "€";
      case "GBP": return "£";
      default: return "$";
    }
  };
  const currencySymbol = getCurrencySymbol(currency);

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["employees"],
    queryFn: getEmployees,
  });

  const { data: attendanceLogs = [], isLoading: loadingAttendance } = useQuery({
    queryKey: ["attendanceLogs"],
    queryFn: getAttendanceLogs,
  });

  const { data: payrollRuns = [], isLoading: loadingPayroll } = useQuery({
    queryKey: ["payrollRuns"],
    queryFn: listPayrollRuns,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });

  // Selected employee ID for Clock terminal
  const [clockSelectedId, setClockSelectedId] = useState("");
  const isSelectedEmployeeClockedIn = clockSelectedId
    ? attendanceLogs.some((log) => log.employeeId === clockSelectedId && !log.clockOut)
    : false;

  // Auto payroll settings from DB
  const autoPayrollEnabled = dbSettings.find(s => s.key === "auto_payroll_enabled")?.value === "true";
  const autoPayrollSchedule = dbSettings.find(s => s.key === "auto_payroll_schedule")?.value || "Monthly";

  // Trigger auto-payroll draft check on page load
  useEffect(() => {
    const triggerAutoPayroll = async () => {
      try {
        const result = await runAutoPayroll();
        if (result) {
          toast.info(result, {
            description: "New payroll entries have been created under Drafts.",
            duration: 7000,
          });
          queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
        }
      } catch (e) {
        console.warn("Failed to execute auto payroll check:", e);
      }
    };
    triggerAutoPayroll();
  }, [queryClient]);

  // Format Helper
  const formatCents = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency,
    });
  };

  // Stats Calculations
  const activeEmployeeCount = employees.filter((e) => e.status === "Active").length;
  const onDutyCount = attendanceLogs.filter((log) => !log.clockOut).length;
  const draftPayrollCents = payrollRuns
    .filter((run) => run.status === "Draft")
    .reduce((acc, run) => acc + run.totalPayCents, 0);

  // Client-side Attendance filtering
  const filteredAttendanceLogs = attendanceLogs.filter((log) => {
    if (filterEmployeeId && log.employeeId !== filterEmployeeId) return false;
    if (filterStartDate) {
      const logDateStr = log.clockIn.split("T")[0];
      if (logDateStr < filterStartDate) return false;
    }
    if (filterEndDate) {
      const logDateStr = log.clockIn.split("T")[0];
      if (logDateStr > filterEndDate) return false;
    }
    return true;
  });

  // Mutations
  const createEmpMutation = useMutation({
    mutationFn: async () => {
      const salaryCents = Math.round(parseFloat(empSalary || "0") * 100);
      const commissionRate = parseFloat(empCommission || "0") / 100;
      await createEmployee({
        name: empName,
        userId: empUserId || undefined,
        email: empEmail || undefined,
        phone: empPhone || undefined,
        baseSalaryCents: salaryCents,
        commissionRate,
        payType: empPayType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEmployeeModalOpen(false);
      setEmpName("");
      setEmpEmail("");
      setEmpPhone("");
      setEmpSalary("");
      setEmpCommission("");
      setEmpUserId("");
      setEmpPayType("Monthly");
      toast.success("Employee profile added successfully.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create employee profile.");
    },
  });

  const updateEmpMutation = useMutation({
    mutationFn: async () => {
      if (!editingEmployee) return;
      const salaryCents = Math.round(parseFloat(editSalary || "0") * 100);
      const commissionRate = parseFloat(editCommission || "0") / 100;
      await updateEmployee(
        editingEmployee.id,
        editName,
        editEmail || null,
        editPhone || null,
        salaryCents,
        commissionRate,
        editPayType,
        editStatus
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditingEmployee(null);
      toast.success("Employee profile updated.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update employee.");
    },
  });

  const clockMutation = useMutation({
    mutationFn: async (empId: string) => {
      return await clockInOut(empId);
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["attendanceLogs"] });
      toast.success(`Success: Employee is now ${status}.`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to log attendance.");
    },
  });

  const createPayrollMutation = useMutation({
    mutationFn: async () => {
      if (!payrollEmployeeId || !periodStart || !periodEnd) {
        throw new Error("Please complete all payroll parameters.");
      }
      const startIso = new Date(periodStart).toISOString();
      const endIso = new Date(periodEnd).toISOString();
      await generatePayrollRun(payrollEmployeeId, startIso, endIso);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      setPayrollModalOpen(false);
      setPayrollEmployeeId("");
      setPeriodStart("");
      setPeriodEnd("");
      toast.success("Payroll run draft generated successfully.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate payroll run.");
    },
  });

  const payPayrollMutation = useMutation({
    mutationFn: async (runId: string) => {
      await payPayrollRun(runId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["balanceSheet"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
      toast.success("Payroll marked as Paid and general ledger entries recorded.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to release payroll payment.");
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await setSetting(key, value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Auto-payroll configuration updated.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update configuration.");
    }
  });

  // Unique profile color generation helper
  const getAvatarGradient = (name: string) => {
    const colors = [
      "from-violet-600 to-indigo-600 shadow-violet-500/10",
      "from-emerald-600 to-teal-600 shadow-emerald-500/10",
      "from-amber-500 to-orange-600 shadow-amber-500/10",
      "from-rose-500 to-pink-600 shadow-rose-500/10",
      "from-sky-500 to-blue-600 shadow-sky-500/10",
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  if (role === "Cashier") {
    return (
      <PageContainer title="HR & Payroll" subtitle="Access Restricted">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Access Restricted</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Your Cashier account does not have permission to view or manage employee records or payroll files.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="HR & Payroll"
      subtitle="Manage employees, track shift attendance, and process cashier commissions."
    >
      {/* High-fidelity Dashboard Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-card border border-border shadow-xs relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-all duration-300" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Active Directory</span>
              <span className="block text-2xl font-black text-foreground">{activeEmployeeCount} Staff</span>
            </div>
            <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xs">
              <Users className="w-5 h-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-xs relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-600/5 rounded-full blur-xl group-hover:bg-emerald-600/10 transition-all duration-300" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Current Shifts</span>
              <span className="block text-2xl font-black text-emerald-500">{onDutyCount} On Duty</span>
            </div>
            <div className="w-11 h-11 rounded-lg bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 shadow-xs">
              <Clock className="w-5 h-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-xs relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all duration-300" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Draft Payouts</span>
              <span className="block text-2xl font-black text-amber-500">{formatCents(draftPayrollCents)}</span>
            </div>
            <div className="w-11 h-11 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-xs">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Styled Tabs Navigation with Spacing and Theme Matches */}
      <div className="flex items-center gap-1.5 bg-card p-1.5 rounded-xl border border-border mb-6 max-w-xl shadow-xs">
        <button
          onClick={() => setActiveTab("directory")}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-3 tracking-wider ${
            activeTab === "directory"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees Directory</span>
        </button>
        <button
          onClick={() => setActiveTab("attendance")}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-3 tracking-wider ${
            activeTab === "attendance"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Attendance Clock</span>
        </button>
        <button
          onClick={() => setActiveTab("payroll")}
          className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-3 tracking-wider ${
            activeTab === "payroll"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payroll Runs</span>
        </button>
      </div>

      {/* Directory Tab */}
      {activeTab === "directory" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Staff Roster</h3>
            {role === "Admin" && (
              <Button onClick={() => setEmployeeModalOpen(true)} className="flex items-center gap-2 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                <UserPlus className="w-4 h-4" />
                <span>Add Employee</span>
              </Button>
            )}
          </div>

          {loadingEmployees ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-48 bg-card border border-border animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {employees.map((emp) => {
                const initials = emp.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                
                const grad = getAvatarGradient(emp.name);
                const isClockedIn = attendanceLogs.some(
                  (log) => log.employeeId === emp.id && !log.clockOut
                );

                return (
                  <Card key={emp.id} className="bg-card border border-border hover:border-primary/40 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col group">
                    <CardHeader className="pb-3 pt-5 px-5 flex flex-row gap-4 items-center justify-between bg-gradient-to-b from-muted/20 to-transparent">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${grad} flex items-center justify-center font-bold text-sm text-white shadow-md`}>
                          {initials}
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">{emp.name}</CardTitle>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] text-muted-foreground font-mono">ID: {emp.id}</span>
                            <span className="text-[9px] text-muted-foreground/30">•</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isClockedIn 
                                ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" 
                                : "bg-slate-500/80"
                            }`} />
                            <span className="text-[9px] font-medium text-muted-foreground">
                              {isClockedIn ? "On Duty" : "Off Duty"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        emp.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
                          : "bg-muted text-slate-450 border border-border"
                      }`}>
                        {emp.status}
                      </span>
                    </CardHeader>
                    
                    <CardContent className="space-y-4 text-xs text-muted-foreground px-5 pb-5 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground/80 hover:text-foreground transition-colors">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground/40" />
                          <span className="truncate">{emp.email || "No email logged"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground/80 hover:text-foreground transition-colors">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground/40" />
                          <span>{emp.phone || "No phone logged"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground/80">
                          <Briefcase className="w-3.5 h-3.5 text-muted-foreground/40" />
                          <span className="font-semibold text-foreground font-mono">
                            {emp.payType || "Monthly"} Base model
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-3 mt-auto">
                        <div className="border-t border-border/80 pt-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 leading-none">
                              {emp.payType === "Daily" ? "Per Day Rate" : "Monthly Salary"}
                            </span>
                            <span className="font-extrabold text-foreground mt-1.5 block text-sm">{formatCents(emp.baseSalaryCents)}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 leading-none">Commissions</span>
                            <span className="font-extrabold text-amber-500 mt-1.5 block text-sm">{(emp.commissionRate * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        
                        {role === "Admin" && (
                          <div className="pt-2 flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingEmployee(emp);
                                setEditName(emp.name);
                                setEditEmail(emp.email || "");
                                setEditPhone(emp.phone || "");
                                setEditSalary((emp.baseSalaryCents / 100).toString());
                                setEditCommission((emp.commissionRate * 100).toString());
                                setEditPayType(emp.payType || "Monthly");
                                setEditStatus(emp.status);
                              }}
                              className="flex-1 text-[10px] h-8 bg-background border-border hover:bg-muted text-foreground transition-all"
                            >
                              Edit Profile
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => clockMutation.mutate(emp.id)}
                              className="text-[10px] h-8 px-3 border-border hover:bg-muted hover:border-primary/20 transition-all"
                              title="Toggle Shift Clock Status"
                            >
                              <Clock3 className="w-3.5 h-3.5 text-primary animate-pulse" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Attendance Clock Tab */}
      {activeTab === "attendance" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Futuristic Clock Terminal */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">Shift Console</h3>
            <Card className="bg-card border border-border shadow-xs overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent pointer-events-none" />
              <CardContent className="p-6 space-y-6 flex flex-col items-center">
                {/* Visual Digital Clock */}
                <div className="py-4 px-6 bg-background rounded-xl border border-border shadow-inner text-center w-full relative group">
                  <span className="block text-[9px] uppercase tracking-widest text-primary/80 font-bold mb-1 font-mono">Terminal Time</span>
                  <span className="text-2xl font-black font-mono tracking-wider text-foreground leading-none">
                    {currentTime.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                  <span className="inline-block text-xs font-mono font-bold text-muted-foreground/60 ml-1.5 animate-pulse">
                    :{currentTime.getSeconds().toString().padStart(2, "0")}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/50 mt-1 font-mono">
                    {currentTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">Select Staff Member</Label>
                  <select
                    className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden transition-all"
                    value={clockSelectedId}
                    onChange={(e) => setClockSelectedId(e.target.value)}
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.filter(e => e.status === "Active").map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                {/* Animated Clock button */}
                <Button
                  onClick={() => {
                    if (clockSelectedId) {
                      clockMutation.mutate(clockSelectedId);
                    } else {
                      toast.warning("Please select an employee first.");
                    }
                  }}
                  disabled={!clockSelectedId || clockMutation.isPending}
                  className={`w-full py-6 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300 shadow-md ${
                    !clockSelectedId
                      ? "bg-muted text-muted-foreground border border-border cursor-not-allowed"
                      : isSelectedEmployeeClockedIn
                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/10 border border-rose-500/30 animate-pulse hover:animate-none"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/10 border border-emerald-500/30"
                  }`}
                >
                  {clockMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                  ) : isSelectedEmployeeClockedIn ? (
                    <span>Clock Out Shift</span>
                  ) : (
                    <span>Clock In Shift</span>
                  )}
                </Button>

                {clockSelectedId && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span>Shift Status:</span>
                    <span className={`font-bold uppercase ${
                      isSelectedEmployeeClockedIn ? "text-rose-500 animate-pulse" : "text-emerald-500"
                    }`}>
                      {isSelectedEmployeeClockedIn ? "On Duty" : "Off Duty"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Shift Sheets Logs with Previous Attendance Date Filter */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-foreground">Shift & Attendance History</h3>
              
              {/* Previous Attendance Search Filters */}
              <div className="bg-card border border-border p-3.5 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Staff Member</Label>
                  <select
                    className="flex h-8.5 w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                    value={filterEmployeeId}
                    onChange={(e) => setFilterEmployeeId(e.target.value)}
                  >
                    <option value="">All Employees</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">Start Date</Label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="h-8.5 text-xs bg-background border-border"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">End Date</Label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="h-8.5 text-xs bg-background border-border"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilterEmployeeId("");
                      setFilterStartDate("");
                      setFilterEndDate("");
                    }}
                    className="h-8.5 text-xs flex-1 border-border hover:bg-muted font-bold text-muted-foreground"
                    title="Clear Filters"
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Clear
                  </Button>
                </div>
              </div>
            </div>

            <Card className="bg-card border border-border shadow-xs overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/80 text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Clock In</th>
                      <th className="py-3 px-4">Clock Out</th>
                      <th className="py-3 px-4">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {loadingAttendance ? (
                      [1, 2, 3].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={4} className="py-4 px-4 bg-muted/10">Loading attendance log row...</td>
                        </tr>
                      ))
                    ) : filteredAttendanceLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground text-xs italic">
                          No attendance records match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAttendanceLogs.map((log) => {
                        const inDate = new Date(log.clockIn);
                        const outDate = log.clockOut ? new Date(log.clockOut) : null;
                        
                        let durationStr = "In Progress";
                        if (outDate) {
                          const diffMs = outDate.getTime() - inDate.getTime();
                          const hrs = Math.floor(diffMs / 3600000);
                          const mins = Math.round((diffMs % 3600000) / 60000);
                          durationStr = `${hrs}h ${mins}m`;
                        }

                        return (
                          <tr key={log.id} className="hover:bg-muted/20 transition-all duration-150">
                            <td className="py-3.5 px-4 font-bold text-foreground">{log.employeeName}</td>
                            <td className="py-3.5 px-4 text-muted-foreground font-mono">
                              {inDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                            </td>
                            <td className="py-3.5 px-4">
                              {outDate ? (
                                <span className="text-muted-foreground font-mono">
                                  {outDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs animate-pulse">
                                  Active Session
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-foreground">{durationStr}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Payroll runs Tab */}
      {activeTab === "payroll" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* Main Payroll List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Compensation Sheets</h3>
              {role === "Admin" && (
                <Button onClick={() => setPayrollModalOpen(true)} className="flex items-center gap-2 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                  <Plus className="w-4 h-4" />
                  <span>Run Payroll Draft</span>
                </Button>
              )}
            </div>

            <Card className="bg-card border border-border shadow-xs overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/80 text-muted-foreground uppercase text-[9px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Payroll Period</th>
                      <th className="py-3 px-4">Base pay</th>
                      <th className="py-3 px-4">Commissions</th>
                      <th className="py-3 px-4">Total Payout</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {loadingPayroll ? (
                      [1, 2, 3].map((i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={7} className="py-4 px-4 bg-muted/10">Loading payroll history...</td>
                        </tr>
                      ))
                    ) : payrollRuns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs italic">
                          No payroll runs generated. Run a draft to calculate commissions.
                        </td>
                      </tr>
                    ) : (
                      payrollRuns.map((run) => {
                        const startStr = new Date(run.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        const endStr = new Date(run.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

                        return (
                          <tr key={run.id} className="hover:bg-muted/20 transition-all duration-150">
                            <td className="py-3.5 px-4 font-bold text-foreground">{run.employeeName}</td>
                            <td className="py-3.5 px-4 text-muted-foreground font-mono">{startStr} - {endStr}</td>
                            <td className="py-3.5 px-4 font-semibold text-foreground font-mono">{formatCents(run.basePayCents)}</td>
                            <td className="py-3.5 px-4 text-amber-500 font-bold font-mono">+{formatCents(run.commissionPayCents)}</td>
                            <td className="py-3.5 px-4 font-black text-foreground font-mono">{formatCents(run.totalPayCents)}</td>
                            <td className="py-3.5 px-4">
                              <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                run.status === "Paid"
                                  ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-450 border border-amber-500/20"
                              }`}>
                                {run.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {run.status === "Draft" && role === "Admin" ? (
                                <Button
                                  size="sm"
                                  onClick={() => payPayrollMutation.mutate(run.id)}
                                  className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500 hover:shadow-xs text-white font-bold px-3 transition-all"
                                >
                                  Release Payout
                                </Button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {run.paidAt ? `Paid ${new Date(run.paidAt).toLocaleDateString()}` : "Locked"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Automatic Payroll Settings panel */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">Auto-Draft Settings</h3>
            <Card className="bg-card border border-border shadow-xs overflow-hidden">
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Automated Payroll</span>
                  </div>
                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-sm ${
                    autoPayrollEnabled ? "bg-emerald-500/10 text-emerald-450" : "bg-muted text-muted-foreground"
                  }`}>
                    {autoPayrollEnabled ? "Active" : "Disabled"}
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Enable switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold text-foreground block">Automatic Payroll drafting</Label>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block leading-relaxed">
                        Periodically create draft payouts for active staff.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPayrollEnabled}
                      onChange={(e) => {
                        updateSettingMutation.mutate({
                          key: "auto_payroll_enabled",
                          value: e.target.checked ? "true" : "false"
                        });
                      }}
                      className="w-4 h-4 text-primary border-border bg-background focus:ring-primary focus:ring-1 rounded-sm cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Schedule Select */}
                  {autoPayrollEnabled && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Label className="font-bold text-foreground">Draft Schedule Frequency</Label>
                      <select
                        className="flex h-8.5 w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                        value={autoPayrollSchedule}
                        onChange={(e) => {
                          updateSettingMutation.mutate({
                            key: "auto_payroll_schedule",
                            value: e.target.value
                          });
                        }}
                      >
                        <option value="Monthly">Monthly (Runs on 1st of month)</option>
                        <option value="Weekly">Weekly (Runs on Mondays)</option>
                      </select>
                      <span className="text-[10px] text-muted-foreground italic leading-relaxed mt-1 block">
                        Checks and generates drafts automatically in the background when admins open the dashboard.
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Add Employee Dialog */}
      <Dialog open={employeeModalOpen} onOpenChange={setEmployeeModalOpen}>
        <DialogContent className="bg-card border border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Add New Employee Profile</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createEmpMutation.mutate();
            }}
            className="space-y-3.5 pt-2 text-xs"
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                placeholder="e.g. Emily Watson"
                className="h-9 text-xs bg-background border-border"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                placeholder="e.g. emily@storeos.com"
                className="h-9 text-xs bg-background border-border"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={empPhone}
                onChange={(e) => setEmpPhone(e.target.value)}
                placeholder="e.g. 555-0102"
                className="h-9 text-xs bg-background border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Pay Rate ({currencySymbol})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={empSalary}
                  onChange={(e) => setEmpSalary(e.target.value)}
                  placeholder="3000.00"
                  className="h-9 text-xs bg-background border-border"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Pay Schedule Model</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                  value={empPayType}
                  onChange={(e) => setEmpPayType(e.target.value)}
                >
                  <option value="Monthly">Monthly Salary</option>
                  <option value="Daily">Daily Rate</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Commission Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={empCommission}
                  onChange={(e) => setEmpCommission(e.target.value)}
                  placeholder="2.0"
                  className="h-9 text-xs bg-background border-border"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Link System Login (Optional)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                value={empUserId}
                onChange={(e) => setEmpUserId(e.target.value)}
              >
                <option value="">-- No User Account Link --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                ))}
              </select>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmployeeModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95" disabled={createEmpMutation.isPending}>
                Create Profile
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={editingEmployee !== null} onOpenChange={(open) => !open && setEditingEmployee(null)}>
        <DialogContent className="bg-card border border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Modify Employee Profile</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateEmpMutation.mutate();
            }}
            className="space-y-3.5 pt-2 text-xs"
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs bg-background border-border"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-9 text-xs bg-background border-border"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="h-9 text-xs bg-background border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Pay Rate ({currencySymbol})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value)}
                  className="h-9 text-xs bg-background border-border"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Pay Schedule Model</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                  value={editPayType}
                  onChange={(e) => setEditPayType(e.target.value)}
                >
                  <option value="Monthly">Monthly Salary</option>
                  <option value="Daily">Daily Rate</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Commission Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editCommission}
                  onChange={(e) => setEditCommission(e.target.value)}
                  className="h-9 text-xs bg-background border-border"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Status</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingEmployee(null)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95" disabled={updateEmpMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Run Payroll Dialog */}
      <Dialog open={payrollModalOpen} onOpenChange={setPayrollModalOpen}>
        <DialogContent className="bg-card border border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">Generate Payroll Period Draft</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createPayrollMutation.mutate();
            }}
            className="space-y-3.5 pt-2 text-xs"
          >
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Select Employee</Label>
              <select
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                value={payrollEmployeeId}
                onChange={(e) => setPayrollEmployeeId(e.target.value)}
                required
              >
                <option value="">-- Choose Employee --</option>
                {employees.filter(e => e.status === "Active").map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.payType || "Monthly"})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Period Start</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="h-9 text-xs bg-background border-border"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Period End</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="h-9 text-xs bg-background border-border"
                  required
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayrollModalOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" className="h-9 text-xs bg-primary text-primary-foreground hover:bg-primary/95" disabled={createPayrollMutation.isPending}>
                Generate Draft
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

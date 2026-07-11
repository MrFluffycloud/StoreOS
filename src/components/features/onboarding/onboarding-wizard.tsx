"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Paintbrush, Sparkles, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSetting, isTauri } from "@/lib/ipc";

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState("StoreOS Kitchen");
  const [currency, setCurrency] = useState("USD");
  const [themeColor, setThemeColor] = useState("slate");
  const [idFormat, setIdFormat] = useState("sku_barcode"); // "sku_barcode" | "sku_serial"
  
  // Administrator details
  const [adminName, setAdminName] = useState("Super User");
  const [adminPin, setAdminPin] = useState("");
  const [adminPinError, setAdminPinError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // Apply chosen color theme live as the user previews it in the onboarding wizard
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme-color", themeColor);
    }
  }, [themeColor]);

  const nextStep = () => {
    if (step === 3) {
      setStep(4);
    } else {
      setStep((s) => s + 1);
    }
  };
  
  const prevStep = () => setStep((s) => s - 1);

  const handleAdminPinChange = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    if (numeric.length <= 4) {
      setAdminPin(numeric);
      setAdminPinError(null);
    }
  };

  const handleFinish = async () => {
    if (adminPin.length !== 4) {
      setAdminPinError("Administrator PIN must be exactly 4 digits.");
      return;
    }
    setLoading(true);
    setAdminPinError(null);
    try {
      // 1. Delete default cashier and auditor users to avoid PIN conflicts
      try {
        await invoke("delete_user", { id: "u2" });
        await invoke("delete_user", { id: "u3" });
      } catch (e) {
        console.warn("Could not delete default seeded users", e);
      }

      // 2. Update default u1 admin user with custom credentials
      await invoke("update_user", {
        id: "u1",
        username: adminName.trim(),
        pin: adminPin,
        role: "Admin"
      });

      // 3. Save all variables to local settings repository
      await setSetting("store_name", storeName);
      await setSetting("currency", currency);
      await setSetting("theme_color", themeColor);
      await setSetting("product_id_format", idFormat);
      await setSetting("onboarded", "true");

      // Trigger Tauri window maximize
      const isTauriActive = isTauri();
      if (isTauriActive) {
        await invoke("resize_to_app");
      }

      onComplete();
    } catch (err: any) {
      console.error("Failed to write onboarding settings", err);
      setAdminPinError(err.message || "Failed to finalize onboarding setup. PIN may be in use.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 select-none font-sans">
      {/* Header */}
      <div className="text-center pt-4">
        <div className="inline-flex w-10 h-10 rounded-xl bg-primary items-center justify-center shadow-lg shadow-primary/20 mb-2 border border-primary/30 transition-all">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-white">Setup StoreOS</h2>
        <p className="text-[10px] text-slate-400 mt-0.5">Step {step} of 4 • Customize your ERP environment</p>
      </div>

      {/* Step Contents */}
      <div className="flex-1 flex flex-col justify-center py-6 max-w-sm mx-auto w-full">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-900 pb-2">1. Retail Shop Branding</h3>
            
            <div className="space-y-2">
              <Label htmlFor="storeName" className="text-xs font-semibold text-slate-300">Shop Name</Label>
              <Input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. StoreOS Kitchen & Dining"
                className="h-9 text-xs bg-slate-900 border-slate-800 focus-visible:ring-primary focus-visible:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="text-xs font-semibold text-slate-300">Base Currency</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-slate-100 font-mono"
              >
                <option value="USD">USD ($ - United States Dollar)</option>
                <option value="EUR">EUR (€ - Euro)</option>
                <option value="GBP">GBP (£ - British Pound)</option>
                <option value="INR">INR (₹ - Indian Rupee)</option>
                <option value="CAD">CAD ($ - Canadian Dollar)</option>
                <option value="AUD">AUD ($ - Australian Dollar)</option>
                <option value="JPY">JPY (¥ - Japanese Yen)</option>
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-900 pb-2 flex items-center gap-1.5">
              <Paintbrush className="w-4 h-4 text-primary" /> 2. Accent Design Theme
            </h3>
            
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-slate-300">Accent Highlight Palette</Label>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { name: "slate", colorClass: "bg-slate-500" },
                  { name: "violet", colorClass: "bg-violet-500" },
                  { name: "emerald", colorClass: "bg-emerald-500" },
                  { name: "rose", colorClass: "bg-rose-500" },
                  { name: "amber", colorClass: "bg-amber-500" },
                ].map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => setThemeColor(color.name)}
                    className={`h-11 rounded-lg flex flex-col items-center justify-center border transition-all ${
                      themeColor === color.name
                        ? "border-primary bg-primary/10 scale-105"
                        : "border-slate-800 bg-slate-900 hover:scale-102"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full ${color.colorClass}`} />
                    <span className="text-[8px] text-slate-400 mt-1 capitalize">{color.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              * StoreOS adaptively displays in a dark-mode theme, using your selected accent for highlighted sections.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-900 pb-2">3. Product Inventory Format</h3>
            
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-slate-300">Primary Product Tracking Method</Label>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setIdFormat("sku_barcode")}
                  className={`w-full p-3 rounded-lg border text-left flex flex-col transition-all ${
                    idFormat === "sku_barcode"
                      ? "border-primary bg-primary/10"
                      : "border-slate-800 bg-slate-900/60"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-200">SKU + Barcode Code (UPC)</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Recommended for packaged goods and scanners.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIdFormat("sku_serial")}
                  className={`w-full p-3 rounded-lg border text-left flex flex-col transition-all ${
                    idFormat === "sku_serial"
                      ? "border-primary bg-primary/10"
                      : "border-slate-800 bg-slate-900/60"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-200">SKU + Serial Number</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Recommended for electronics, high-value tools, or custom serial tags.</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-900 pb-2 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-primary" /> 4. Create Administrator Account
            </h3>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="adminName" className="text-xs font-semibold text-slate-300">Admin Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    id="adminName"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="e.g. Administrator"
                    className="h-9 pl-9 text-xs bg-slate-900 border-slate-800 focus-visible:ring-primary focus-visible:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPin" className="text-xs font-semibold text-slate-300">Create 4-Digit Login PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input
                    id="adminPin"
                    type="password"
                    maxLength={4}
                    value={adminPin}
                    onChange={(e) => handleAdminPinChange(e.target.value)}
                    placeholder="••••"
                    className="h-9 pl-9 text-xs font-mono bg-slate-900 border-slate-800 focus-visible:ring-primary focus-visible:border-primary tracking-widest text-center text-sm"
                  />
                </div>
                <p className="text-[9px] text-slate-500">
                  This PIN will be required to log in to the system. Keep it secure.
                </p>
              </div>

              {adminPinError && (
                <div className="p-2 text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded text-[10px] font-semibold">
                  {adminPinError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Nav Controls */}
      <div className="flex items-center justify-between border-t border-slate-900 pt-4">
        {step > 1 ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8.5 text-xs text-slate-400 hover:text-white"
            onClick={prevStep}
            disabled={loading}
          >
            Back
          </Button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <Button
            type="button"
            className="h-8.5 px-4 text-xs font-medium bg-primary hover:bg-primary/95 text-primary-foreground transition-all"
            onClick={nextStep}
          >
            Next Step
          </Button>
        ) : (
          <Button
            type="button"
            className="h-8.5 px-4 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
            onClick={handleFinish}
            disabled={loading || adminPin.length !== 4}
          >
            {loading ? "Saving..." : <>Complete Setup <Check className="w-3.5 h-3.5" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}

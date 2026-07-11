"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Paintbrush, Sparkles } from "lucide-react";
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
  const [loading, setLoading] = useState(false);

  // Apply chosen color theme live as the user previews it in the onboarding wizard
  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme-color", themeColor);
    }
  }, [themeColor]);

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleFinish = async () => {
    setLoading(true);
    try {
      // Save all variables to local settings repository
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
    } catch (err) {
      console.error("Failed to write onboarding settings", err);
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
        <p className="text-[10px] text-slate-400 mt-0.5">Step {step} of 3 • Customize your ERP environment</p>
      </div>

      {/* Step Contents */}
      <div className="flex-1 flex flex-col justify-center py-6">
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
              * StoreOS automatically adapts to a premium, dark-mode-first aesthetic with glowing borders in your chosen accent.
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

        {step < 3 ? (
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
            disabled={loading}
          >
            {loading ? "Saving..." : <>Complete Setup <Check className="w-3.5 h-3.5" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}

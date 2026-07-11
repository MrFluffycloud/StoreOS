"use client";

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { UserCheck, ShieldAlert, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri, resetStore } from "@/lib/ipc";
import { Logo } from "@/components/ui/logo";
import { useAlerts } from "@/components/providers/alert-provider";

interface UserSession {
  username: string;
  role: string;
}

interface LoginScreenProps {
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { showAlert, showConfirm, showPrompt } = useAlerts();

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setError("");
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        submitPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const submitPin = async (enteredPin: string) => {
    setLoading(true);
    try {
      // Check if Tauri is active, else fall back to web mock
      const isTauriActive = isTauri();
      let session: UserSession | null = null;
      if (isTauriActive) {
        session = await invoke<UserSession | null>("login_user", { pin: enteredPin });
      } else {
        // Web mock sessions
        if (enteredPin === "1234") session = { username: "Admin", role: "Admin" };
        else if (enteredPin === "5555") session = { username: "Cashier", role: "Cashier" };
        else if (enteredPin === "9999") session = { username: "Auditor", role: "Auditor" };
      }

      if (session) {
        onLoginSuccess(session);
      } else {
        setError("Invalid credentials. Try again.");
        setPin("");
      }
    } catch (err) {
      console.error(err);
      setError("Login service error.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const pinVal = await showPrompt(
      "This action is restricted to developer override. Please enter the Developer Reset PIN (Contact MrFluffycloud if you do not have it):",
      "Developer PIN Required"
    );
    if (pinVal !== "9842") {
      await showAlert(
        "Access Denied: Invalid Developer Reset PIN. Please contact MrFluffycloud for the authorization code.",
        "Access Denied",
        "error"
      );
      return;
    }

    const confirm1 = await showConfirm(
      "⚠️ DANGER ZONE: Are you sure you want to delete this store?\n\n" +
      "This will permanently delete all products, sales history, inventory logs, and reset all onboarding styles. This action cannot be undone.",
      "Dangerous Action"
    );
    if (!confirm1) return;

    const confirm2 = await showPrompt(
      "To confirm deletion, please type 'RESET STORE' in the box below:",
      "Confirmation Required"
    );
    if (confirm2 !== "RESET STORE") {
      await showAlert("Reset aborted. The input did not match 'RESET STORE'.", "Aborted", "warning");
      return;
    }

    setLoading(true);
    try {
      await resetStore();
      await showAlert("Store has been successfully reset. The application will now reload.", "Reset Completed", "info");
      window.location.reload();
    } catch (err) {
      console.error("Failed to delete store database", err);
      await showAlert("Failed to delete store. See logs.", "Reset Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6 select-none font-sans">
      {/* Branding and Header */}
      <div className="flex flex-col items-center pt-8 text-center">
        <Logo className="w-14 h-14 mb-4 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.05)]" />
        <h1 className="text-xl font-bold tracking-tight text-white">StoreOS</h1>
        <p className="text-xs text-slate-400 mt-1">Enterprise Retail ERP System</p>
      </div>

      {/* Pin Input Display */}
      <div className="flex flex-col items-center my-4 w-full">
        {/* Dot Indicators */}
        <div className="flex gap-4 mb-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                index < pin.length
                  ? "bg-primary border-primary scale-110 shadow-[0_0_8px_var(--primary)]"
                  : "border-slate-700 bg-slate-900"
              }`}
            />
          ))}
        </div>

        {/* Error Frame */}
        <div className="h-6 flex items-center justify-center">
          {error ? (
            <p className="text-[10px] text-rose-500 font-semibold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> {error}
            </p>
          ) : (
            <p className="text-[10px] text-slate-500">
              Admin PIN: <span className="font-mono">1234</span> | Cashier: <span className="font-mono">5555</span>
            </p>
          )}
        </div>
      </div>

      {/* Grid Keypad */}
      <div className="w-full max-w-[280px] grid grid-cols-3 gap-3 pb-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
          <Button
            key={num}
            type="button"
            variant="outline"
            className="h-14 text-lg font-semibold rounded-xl bg-slate-900/60 border-slate-800 text-slate-200 hover:bg-slate-800 hover:text-white transition-all active:scale-95"
            onClick={() => handleKeyPress(num)}
            disabled={loading}
          >
            {num}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="h-14 text-xs font-semibold text-slate-400 hover:text-white"
          onClick={handleClear}
          disabled={loading}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-14 text-lg font-semibold rounded-xl bg-slate-900/60 border-slate-800 text-slate-200 hover:bg-slate-800 hover:text-white transition-all active:scale-95"
          onClick={() => handleKeyPress("0")}
          disabled={loading}
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-14 flex items-center justify-center text-slate-400 hover:text-white"
          onClick={handleBackspace}
          disabled={loading}
        >
          <Delete className="w-5 h-5" />
        </Button>
      </div>

      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        className="text-[10px] text-slate-600 hover:text-slate-400 font-semibold cursor-pointer pb-2 transition-colors select-none"
      >
        Developer Reset Override
      </button>
    </div>
  );
}

"use client";

import React, { createContext, useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Info, HelpCircle } from "lucide-react";

interface AlertConfig {
  title: string;
  message: string;
  type: "info" | "warning" | "error";
  mode: "alert" | "confirm" | "prompt";
  defaultValue?: string;
  resolve: (value: any) => void;
}

const AlertContext = createContext<{
  showAlert: (message: string, title?: string, type?: "info" | "warning" | "error") => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
  showPrompt: (message: string, title?: string, defaultValue?: string) => Promise<string | null>;
} | null>(null);

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [inputValue, setInputValue] = useState("");

  const showAlert = (message: string, title = "Notification", type: "info" | "warning" | "error" = "info") => {
    return new Promise<void>((resolve) => {
      setConfig({ title, message, type, mode: "alert", resolve });
    });
  };

  const showConfirm = (message: string, title = "Confirm Action") => {
    return new Promise<boolean>((resolve) => {
      setConfig({ title, message, type: "warning", mode: "confirm", resolve });
    });
  };

  const showPrompt = (message: string, title = "Input Required", defaultValue = "") => {
    setInputValue(defaultValue);
    return new Promise<string | null>((resolve) => {
      setConfig({ title, message, type: "info", mode: "prompt", defaultValue, resolve });
    });
  };

  const handleClose = (value: any) => {
    if (config) {
      config.resolve(value);
      setConfig(null);
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      <Dialog open={config !== null} onOpenChange={() => handleClose(config?.mode === "alert" ? undefined : null)}>
        <DialogContent className="max-w-sm select-none bg-card border border-border p-6 text-center focus:outline-none rounded-2xl">
          <DialogHeader className="flex flex-col items-center">
            {config?.type === "error" && (
              <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
            )}
            {config?.type === "warning" && (
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 text-amber-500" />
              </div>
            )}
            {config?.type === "info" && (
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                {config.mode === "confirm" ? (
                  <HelpCircle className="w-6 h-6 text-primary" />
                ) : (
                  <Info className="w-6 h-6 text-primary" />
                )}
              </div>
            )}
            <DialogTitle className="text-sm font-bold text-foreground">
              {config?.title}
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-line">
            {config?.message}
          </p>

          {config?.mode === "prompt" && (
            <div className="mt-4">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="h-9 text-xs bg-background/50 border border-border/80 focus:bg-background text-foreground"
                autoFocus
              />
            </div>
          )}

          <DialogFooter className="mt-6 flex flex-row gap-2 justify-center">
            {config?.mode === "alert" && (
              <Button
                onClick={() => handleClose(undefined)}
                className="flex-1 h-8.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Okay
              </Button>
            )}
            {config?.mode === "confirm" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="flex-1 h-8.5 text-xs font-semibold border border-border text-foreground hover:bg-muted/40"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleClose(true)}
                  className="flex-1 h-8.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Confirm
                </Button>
              </>
            )}
            {config?.mode === "prompt" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleClose(null)}
                  className="flex-1 h-8.5 text-xs font-semibold border border-border text-foreground hover:bg-muted/40"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleClose(inputValue)}
                  className="flex-1 h-8.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  Submit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AlertContext.Provider>
  );
}

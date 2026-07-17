"use client";

import { ArrowRight, Bot, Check, ChevronDown, Paperclip, Sparkles } from "lucide-react";
import { useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;

      const newHeight = Math.max(
        minHeight,
        Math.min(
          textarea.scrollHeight,
          maxHeight ?? Number.POSITIVE_INFINITY
        )
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

const GEMINI_ICON = (
  <svg
    height="1em"
    className="w-4 h-4 flex-shrink-0"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Gemini</title>
    <defs>
      <linearGradient
        id="lobe-icons-gemini-fill"
        x1="0%"
        x2="68.73%"
        y1="100%"
        y2="30.395%"
      >
        <stop offset="0%" stopColor="#1C7DFF" />
        <stop offset="52.021%" stopColor="#1C69FF" />
        <stop offset="100%" stopColor="#F0DCD6" />
      </linearGradient>
    </defs>
    <path
      d="M12 24A14.304 14.304 0 000 12 14.304 14.304 0 0012 0a14.305 14.305 0 0012 12 14.305 14.305 0 00-12 12"
      fill="url(#lobe-icons-gemini-fill)"
      fillRule="nonzero"
    />
  </svg>
);

const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
};

interface AIPromptProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: string[];
  placeholder?: string;
  className?: string;
}

export function AI_Prompt({
  value,
  onChange,
  onSend,
  disabled = false,
  selectedModel,
  onModelChange,
  models,
  placeholder = "Ask a question about sales, stock, or business strategies...",
  className,
}: AIPromptProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim() && !disabled) {
      e.preventDefault();
      onSend();
      setTimeout(() => adjustHeight(true), 10);
    }
  };

  const handleSendClick = () => {
    if (!value.trim() || disabled) return;
    onSend();
    setTimeout(() => adjustHeight(true), 10);
  };

  return (
    <div className={cn("w-full py-2 select-none", className)}>
      <div className="bg-black/5 dark:bg-white/5 border border-border/40 rounded-2xl p-1.5 shadow-sm">
        <div className="relative">
          <div className="relative flex flex-col">
            <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
              <Textarea
                id="ai-input-field"
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                  "w-full rounded-xl rounded-b-none px-3.5 py-2.5 bg-transparent border-none dark:text-white placeholder:text-muted-foreground resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs leading-relaxed",
                  "min-h-[52px]"
                )}
                ref={textareaRef}
                onKeyDown={handleKeyDown}
                onChange={(e) => {
                  onChange(e.target.value);
                  adjustHeight();
                }}
              />
            </div>

            <div className="h-12 bg-black/[0.02] dark:bg-white/[0.02] rounded-b-xl flex items-center border-t border-border/30">
              <div className="absolute left-3 right-3 bottom-3.5 flex items-center justify-between w-[calc(100%-24px)]">
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={disabled}
                      className="flex items-center gap-1.5 h-7.5 pl-1.5 pr-2.5 text-xs rounded-lg dark:text-white hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500 border border-border/20 shadow-sm bg-transparent cursor-pointer font-medium"
                    >
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={selectedModel}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-center gap-1.5"
                        >
                          {GEMINI_ICON}
                          <span className="font-medium text-[11px]">
                            {MODEL_LABELS[selectedModel] || selectedModel}
                          </span>
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </motion.div>
                      </AnimatePresence>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className={cn(
                        "min-w-[12rem] text-xs",
                        "border-border/60 bg-popover",
                        "bg-gradient-to-b from-white via-white to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-800"
                      )}
                    >
                      {models.map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => onModelChange(model)}
                          className="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 cursor-pointer text-foreground"
                        >
                          <div className="flex items-center gap-2">
                            {GEMINI_ICON}
                            <span className="text-[11px] font-medium">{MODEL_LABELS[model] || model}</span>
                          </div>
                          {selectedModel === model && (
                            <Check className="w-3.5 h-3.5 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5" />
                  
                  <label
                    className={cn(
                      "rounded-lg p-1.5 bg-black/5 dark:bg-white/5 cursor-pointer transition-colors border border-border/10",
                      "hover:bg-black/10 dark:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500",
                      "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                    )}
                    aria-label="Attach file"
                  >
                    <input type="file" className="hidden" disabled={disabled} />
                    <Paperclip className="w-3.5 h-3.5 transition-colors" />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSendClick}
                  disabled={!value.trim() || disabled}
                  className={cn(
                    "rounded-lg p-1.5 transition-all flex items-center justify-center border border-border/20 shadow-sm",
                    value.trim() && !disabled
                      ? "bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer"
                      : "bg-black/5 dark:bg-white/5 text-black/30 dark:text-white/30 cursor-not-allowed"
                  )}
                  aria-label="Send message"
                >
                  <ArrowRight
                    className={cn(
                      "w-3.5 h-3.5 transition-opacity duration-200"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

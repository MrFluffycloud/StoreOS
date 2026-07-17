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

const OPENAI_ICON = (
  <svg
    height="1em"
    className="w-4 h-4 flex-shrink-0 text-[#10a37f]"
    viewBox="0 0 16 16"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M13.67 6.04c-.06-.4-.25-.76-.55-1.04-.3-.26-.68-.43-1.09-.48a3.3 3.3 0 0 0-1.74-.75c-.38-.07-.78-.06-1.16.03a3.3 3.3 0 0 0-2.31-1.32c-.4-.04-.8.04-1.15.22-.36.18-.66.45-.88.78-.1-.02-.2-.03-.3-.03-.83 0-1.58.46-1.95 1.2-.28.16-.52.38-.7.66-.18.27-.29.58-.32.9a3.3 3.3 0 0 0-1.04 1.93c-.04.4.04.8.22 1.15.18.36.45.66.78.88.02.1.03.2.03.3 0 .83.46 1.58 1.2 1.95.16.28.38.52.66.7.27.18.58.29.9.32a3.3 3.3 0 0 0 1.93 1.04c.4.04.8-.04 1.15-.22.36-.18.66-.45.88-.78.1.02.2.03.3.03.83 0 1.58-.46 1.95-1.2.28-.16.52-.38.7-.66.18-.27.29-.58.32-.9a3.3 3.3 0 0 0 1.04-1.93c.04-.4-.04-.8-.22-1.15-.18-.36-.45-.66-.78-.88-.02-.1-.03-.2-.03-.3 0-.83-.46-1.58-1.2-1.95-.16-.28-.38-.52-.66-.7a3.3 3.3 0 0 0-.9-.32zM8 11.23a1.95 1.95 0 0 1-1.37-.57 1.93 1.93 0 0 1-.57-1.37c0-.52.2-1.02.57-1.37l3.65-2.11a1.94 1.94 0 0 1 2.37.28c.36.36.57.86.57 1.37v4.22L9.58 9.57A1.95 1.95 0 0 1 8 11.23zm-.7-4.14L3.65 9.2a1.93 1.93 0 0 1-.57-1.37c0-.52.2-1.02.57-1.37.36-.36.86-.57 1.37-.57h4.22L6.87 7.7a1.95 1.95 0 0 1 .43-.61zm.13-1.63L7.43.91A1.94 1.94 0 0 1 9.8.63c.36.36.57.86.57 1.37v4.22L6.72 4.1a1.95 1.95 0 0 1 .71-1.37zm2.15 4.77l3.65 2.11a1.93 1.93 0 0 1 .57 1.37c0 .52-.2 1.02-.57 1.37-.36.36-.86.57-1.37.57H9.22l2.35-1.36a1.95 1.95 0 0 1-.43-.61zM9.58 6.43l3.65-2.11a1.93 1.93 0 0 1 .57 1.37c0 .52-.2 1.02-.57 1.37l-3.65 2.11V4.94a1.94 1.94 0 0 1-.57-1.37zM6.43 9.57l-3.65 2.11a1.93 1.93 0 0 1-.57-1.37c0-.52.2-1.02.57-1.37l3.65-2.11v4.22a1.94 1.94 0 0 1 .57 1.37z"/>
  </svg>
);

const METALLAMA_ICON = (
  <svg
    height="1em"
    className="w-4 h-4 flex-shrink-0"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="llama-fill" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill="url(#llama-fill)" />
    <text x="12" y="16.5" fill="#ffffff" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">🦙</text>
  </svg>
);

const DEEPSEEK_ICON = (
  <svg
    height="1em"
    className="w-4 h-4 flex-shrink-0"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="deepseek-fill" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill="url(#deepseek-fill)" />
    <text x="12" y="16" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">D</text>
  </svg>
);

const GLM_ICON = (
  <svg
    height="1em"
    className="w-4 h-4 flex-shrink-0"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="glm-fill" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill="url(#glm-fill)" />
    <text x="12" y="16.5" fill="#ffffff" fontSize="12" fontWeight="black" textAnchor="middle" fontFamily="sans-serif">G</text>
  </svg>
);

const DEFAULT_AI_ICON = (
  <Sparkles className="w-4 h-4 flex-shrink-0 text-primary animate-pulse" />
);

export const getModelIcon = (modelName: string): React.ReactNode => {
  if (!modelName) return DEFAULT_AI_ICON;
  const name = modelName.toLowerCase();
  
  if (name.includes("gemini") || name.includes("google")) {
    return GEMINI_ICON;
  }
  if (name.includes("gpt") || name.includes("openai")) {
    return OPENAI_ICON;
  }
  if (name.includes("llama") || name.includes("meta")) {
    return METALLAMA_ICON;
  }
  if (name.includes("deepseek")) {
    return DEEPSEEK_ICON;
  }
  if (name.includes("glm") || name.includes("chatglm")) {
    return GLM_ICON;
  }
  return DEFAULT_AI_ICON;
};

export const formatModelName = (raw: string): string => {
  if (!raw) return "";
  // Strip srv_[a-zA-Z0-9]+:
  let cleaned = raw.replace(/^srv_[a-zA-Z0-9]+:/, "");
  // Strip models/
  cleaned = cleaned.replace(/^models\//, "");
  
  const uppercaseWords = ["openai", "gpt", "gemini", "glm", "ai", "sdxl", "flux", "api", "meta", "llama"];
  
  cleaned = cleaned
    .split('/')
    .map(part => {
      return part
        .split('-')
        .map(word => {
          if (!word) return "";
          // Check if version like 2.5, 3.1, 4o
          if (/^\d+(\.\d+)*[a-z]?$/.test(word)) return word;
          if (uppercaseWords.includes(word.toLowerCase())) {
            if (word.toLowerCase() === "openai") return "OpenAI";
            if (word.toLowerCase() === "gemini") return "Gemini";
            if (word.toLowerCase() === "llama") return "Llama";
            if (word.toLowerCase() === "meta") return "Meta";
            return word.toUpperCase();
          }
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
    })
    .join(" / ");
  
  return cleaned.trim();
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
                          {getModelIcon(selectedModel)}
                          <span className="font-medium text-[11px]">
                            {formatModelName(selectedModel)}
                          </span>
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </motion.div>
                      </AnimatePresence>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className={cn(
                        "min-w-[12rem] text-xs max-h-60 overflow-y-auto scrollbar-thin",
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
                            {getModelIcon(model)}
                            <span className="text-[11px] font-medium">{formatModelName(model)}</span>
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

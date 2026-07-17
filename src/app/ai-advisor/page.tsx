"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Send,
  Brain,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  Bot,
  User,
  CheckCircle2,
  Lock,
  ArrowRight,
  ChevronRight,
  TrendingDown,
  Layers,
  ArrowUpRight,
  Check,
  AlertCircle
} from "lucide-react";
import { getProducts, listInventoryMovements, getSuppliers, getSettings, setSetting, callGemini } from "@/lib/ipc";
import { useAlerts } from "@/components/providers/alert-provider";
import { toast } from "sonner";
import { AI_Prompt } from "@/components/ui/animated-ai-input";

interface InsightItem {
  category: "Inventory" | "Pricing" | "Sales" | "Strategy";
  title: string;
  description: string;
  impact: "High" | "Medium" | "Low";
  action: string;
}

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

export default function AIAdvisorPage() {
  const queryClient = useQueryClient();
  const { showAlert } = useAlerts();

  const [activeTab, setActiveTab] = useState<"insights" | "chat">("insights");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [insightsTime, setInsightsTime] = useState<string | null>(null);

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch DB records
  const { data: dbSettings = [], refetch: refetchSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const isDataLoading = productsLoading || movementsLoading || suppliersLoading;

  // Check if API key is configured
  const apiKey = dbSettings.find((s) => s.key === "gemini_api_key")?.value || "";
  const modelName = dbSettings.find((s) => s.key === "gemini_model")?.value || "gemini-2.5-flash-lite";

  // Load cached insights from local storage on mount
  useEffect(() => {
    const cached = localStorage.getItem("storeos_ai_insights");
    const cachedTime = localStorage.getItem("storeos_ai_insights_time");
    if (cached) {
      try {
        setInsights(JSON.parse(cached));
        setInsightsTime(cachedTime);
      } catch (e) {
        console.error("Failed to parse cached insights", e);
      }
    }
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // Handle saving API key directly from the page
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await setSetting("gemini_api_key", apiKeyInput.trim());
      await setSetting("gemini_model", "gemini-2.5-flash-lite");
      await refetchSettings();
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("AI Configuration Activated", {
        description: "Your Gemini API Key has been saved locally.",
      });
      setApiKeyInput("");
    } catch (err: any) {
      toast.error("Failed to save configuration", {
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setSavingKey(false);
    }
  };

  // Compile context summaries to inject into LLM prompts
  const compileContextSummary = () => {
    const totalProducts = products.length;
    const totalSuppliers = suppliers.length;
    const categories = Array.from(new Set(products.map((p) => p.category || "General")));

    // Product summaries
    const productSummaries = products.map((p) => ({
      name: p.name,
      sku: p.sku,
      category: p.category || "General",
      price: p.priceCents / 100,
      cost: p.costCents / 100,
    }));

    // Stock calculation
    const stockMap = new Map<string, number>();
    products.forEach((p) => stockMap.set(p.id, 0));
    movements.forEach((m) => {
      const current = stockMap.get(m.productId) || 0;
      stockMap.set(m.productId, current + m.quantity);
    });

    const lowStockItems = Array.from(stockMap.entries())
      .map(([productId, stock]) => {
        const prod = products.find((p) => p.id === productId);
        return {
          name: prod?.name || "Unknown",
          sku: prod?.sku || "",
          stock,
        };
      })
      .filter((item) => item.stock <= 5);

    // 30 days financials
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let revenueCents = 0;
    let costCents = 0;
    const txIds = new Set<string>();

    movements.forEach((m) => {
      const date = new Date(m.timestamp);
      if (date < thirtyDaysAgo) return;

      const prod = products.find((p) => p.id === m.productId);
      if (!prod) return;

      const qty = Math.abs(m.quantity);
      if (m.movementType === "Sale") {
        revenueCents += qty * prod.priceCents;
        costCents += qty * prod.costCents;
        if (m.referenceId) txIds.add(m.referenceId);
      } else if (m.movementType === "SalesReturn") {
        revenueCents -= qty * prod.priceCents;
        costCents -= qty * prod.costCents;
        if (m.referenceId) txIds.add(m.referenceId);
      }
    });

    const profitCents = revenueCents - costCents;
    const margin = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

    return {
      overview: {
        totalProducts,
        totalSuppliers,
        categoriesCount: categories.length,
        categoriesList: categories,
        last30Days: {
          revenue: revenueCents / 100,
          cogs: costCents / 100,
          netProfit: profitCents / 100,
          grossMarginPercent: margin.toFixed(1) + "%",
          transactionsCount: txIds.size,
        },
      },
      lowStock: lowStockItems.slice(0, 10),
      products: productSummaries.slice(0, 40),
      suppliers: suppliers.map((s) => ({ name: s.name })),
    };
  };

  // Generate automated strategic business insights
  const handleRefreshInsights = async () => {
    if (isDataLoading) return;
    setGeneratingInsights(true);

    try {
      const context = compileContextSummary();
      const systemInstruction =
        "You are an elite retail business consultant. Analyze the store's products, suppliers, low stock items, and recent 30-day sales/margins. You must return exact JSON that provides 4 strategic recommendations to improve profits, clear dead inventory, negotiate with suppliers, or refine pricing.";

      const prompt = `Analyze the following StoreOS retail business data and generate exactly 4 key actionable business insights.
Your suggestions should cover the following categories:
1. "Inventory" - slow stock, reorder warnings, dead capital.
2. "Pricing" - items with too small margin, pricing strategy, cost vs price changes.
3. "Sales" - category performance, revenue velocity, optimization.
4. "Strategy" - vendor bundling, discount campaigns, negotiation options.

Return the response ONLY as a JSON object matching this schema:
{
  "insights": [
    {
      "category": "Inventory" | "Pricing" | "Sales" | "Strategy",
      "title": "Short title describing the insight",
      "description": "Detailed explanation of the problem, referencing actual products or metrics from our data.",
      "impact": "High" | "Medium" | "Low",
      "action": "Immediate recommended action to take"
    }
  ]
}

DO NOT include any markdown block formatting (like \`\`\`json) or extra text. Return raw JSON.

Here is the store data:
${JSON.stringify(context, null, 2)}`;

      const response = await callGemini(prompt, systemInstruction);

      // Clean response (strip markdown code blocks if any)
      let cleaned = response.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
        cleaned = cleaned.replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      if (parsed.insights && Array.isArray(parsed.insights)) {
        setInsights(parsed.insights);
        const timeStr = new Date().toLocaleString();
        setInsightsTime(timeStr);
        localStorage.setItem("storeos_ai_insights", JSON.stringify(parsed.insights));
        localStorage.setItem("storeos_ai_insights_time", timeStr);
        toast.success("Business Insights Refreshed", {
          description: "4 strategic recommendations have been generated based on current data.",
        });
      } else {
        throw new Error("Invalid insights JSON format.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate insights", {
        description: err.message || "Ensure your API Key is valid and try again.",
      });
    } finally {
      setGeneratingInsights(false);
    }
  };

  // Handle Chat message sending
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || inputText;
    if (!messageText.trim() || chatLoading) return;

    if (!textToSend) setInputText("");

    const newUserMsg: Message = {
      id: Math.random().toString(),
      role: "user",
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setChatLoading(true);

    try {
      const context = compileContextSummary();
      const systemInstruction = `You are "StoreOS AI Advisor", a helpful expert business assistant built into StoreOS. 
You have read access to the store's current data (summarized below). Answer questions regarding inventory levels, low stock warnings, suppliers, sales/margins, and general retailing strategy.
Give professional, data-driven, and highly practical feedback to help the user grow their business.
Format responses in clean Markdown.

Here is the current StoreOS data summary:
${JSON.stringify(context, null, 2)}`;

      // Compile chat history for the prompt
      const chatHistory = [...messages, newUserMsg].map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const response = await callGemini(JSON.stringify(chatHistory), systemInstruction);

      const newBotMsg: Message = {
        id: Math.random().toString(),
        role: "model",
        text: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, newBotMsg]);
    } catch (err: any) {
      toast.error("AI Advisor error", {
        description: err.message || "Failed to contact Gemini API. Verify internet connection.",
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleModelChange = async (newModel: string) => {
    try {
      await setSetting("gemini_model", newModel);
      await refetchSettings();
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("AI Model Updated", {
        description: `Switched active LLM to ${newModel}.`,
      });
    } catch (e: any) {
      toast.error("Failed to update model", {
        description: e.message || "An unexpected error occurred.",
      });
    }
  };

  const preseededPrompts = [
    "Identify products with the lowest profit margins.",
    "Which items are currently low on stock and need reordering?",
    "Give me 3 marketing ideas to improve cookware sales.",
    "Help me negotiate a volume discount script for key suppliers.",
  ];

  // Render Onboarding Screen if API key is not configured
  if (!apiKey) {
    return (
      <PageContainer
        title="AI Advisor"
        subtitle="Unleash strategic business analytics powered by Google Gemini AI"
      >
        <div className="max-w-2xl mx-auto py-12 select-none">
          <div className="text-center space-y-4 mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
              <Sparkles className="w-7.5 h-7.5 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Activate Your AI Business Advisor</h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Unlock intelligent recommendations, stock forecasting, margin audits, and custom business coaching. Enter a Google Gemini API Key below to start.
            </p>
          </div>

          <Card className="border border-border bg-card shadow-md">
            <CardContent className="pt-6 space-y-6">
              <form onSubmit={handleSaveApiKey} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="apiKey" className="text-xs font-semibold text-foreground">Gemini API Key</Label>
                    <a
                      href="https://aistudio.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      Get a free key in Google AI Studio <ArrowUpRight className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter AIzaSy... API Key"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="h-9.5 text-xs pr-10 font-mono"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={savingKey || !apiKeyInput}
                  className="w-full h-9.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  {savingKey ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving Configuration...
                    </>
                  ) : (
                    <>
                      Activate AI Capabilities <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-6 border-t border-border/40 grid grid-cols-2 gap-4">
                <div className="space-y-1.5 p-3 rounded-lg border border-border/50 bg-muted/20">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> Secure and Private
                  </h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Your key is stored locally in the SQLite database and only sent directly to Google servers. No third-party relays.
                  </p>
                </div>
                <div className="space-y-1.5 p-3 rounded-lg border border-border/50 bg-muted/20">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> Generous Free Tier
                  </h4>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Google AI Studio provides a free rate limit (up to 15 RPM for Gemini 2.5 Flash), costing you $0 for daily store operations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="AI Business Advisor"
      subtitle="Strategic insights, stock analysis, and pricing audits powered by Google Gemini AI"
    >
      <div className="space-y-6">
        {/* Navigation Tab Header */}
        <div className="flex border-b border-border/60 gap-6 select-none justify-between items-center">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("insights")}
              className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "insights"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brain className="w-4 h-4" /> Store Health & Insights
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`pb-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "chat"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bot className="w-4 h-4" /> Interactive Chat Advisor
            </button>
          </div>

          <div className="text-[10px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-full border border-border/30 mb-2 flex items-center gap-1 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            Using {modelName}
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === "insights" ? (
          <div className="space-y-6">
            {/* Control Bar */}
            <div className="flex items-center justify-between select-none bg-muted/30 border border-border/40 p-3.5 rounded-xl">
              <div>
                <h3 className="text-xs font-bold text-foreground">Strategic Insights Engine</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {insightsTime ? `Last refreshed: ${insightsTime}` : "No insights generated yet."}
                </p>
              </div>
              <Button
                onClick={handleRefreshInsights}
                disabled={generatingInsights || isDataLoading}
                className="h-8.5 text-xs font-semibold flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm hover:shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]"
              >
                {generatingInsights ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing Store Data...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Insights
                  </>
                )}
              </Button>
            </div>

            {/* Empty State */}
            {insights.length === 0 && !generatingInsights && (
              <div className="flex flex-col items-center justify-center py-20 text-center select-none border border-dashed border-border/60 rounded-xl bg-card/20">
                <Brain className="w-12 h-12 text-muted-foreground/45 mb-4 animate-bounce" />
                <h4 className="text-sm font-bold text-foreground">No Insights Generated</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Click the **Refresh Insights** button above to feed your products, inventory levels, and sales totals into Gemini for a strategic business assessment.
                </p>
              </div>
            )}

            {/* Loading Skeleton */}
            {generatingInsights && (
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="border border-border/50 bg-card select-none">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <div className="w-24 h-4 bg-muted animate-pulse rounded"></div>
                      <div className="w-12 h-4 bg-muted animate-pulse rounded-full"></div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="w-full h-5 bg-muted animate-pulse rounded"></div>
                      <div className="w-full h-12 bg-muted animate-pulse rounded"></div>
                      <div className="w-full h-8.5 bg-muted/40 animate-pulse rounded-lg mt-2"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Insights Display Grid */}
            {insights.length > 0 && !generatingInsights && (
              <div className="grid grid-cols-2 gap-5">
                {insights.map((item, idx) => {
                  // Determine color scheme based on category
                  let catColor = "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
                  if (item.category === "Pricing") {
                    catColor = "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
                  } else if (item.category === "Sales") {
                    catColor = "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
                  } else if (item.category === "Strategy") {
                    catColor = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
                  }

                  // Impact color
                  let impactColor = "text-rose-500 bg-rose-500/10 border-rose-500/20";
                  if (item.impact === "Medium") {
                    impactColor = "text-amber-500 bg-amber-500/10 border-amber-500/20";
                  } else if (item.impact === "Low") {
                    impactColor = "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
                  }

                  return (
                    <Card
                      key={idx}
                      className="border border-border/60 bg-gradient-to-br from-card to-card/90 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group hover:border-primary/20"
                    >
                      <CardHeader className="pb-3.5 border-b border-border/30">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${catColor}`}>
                            {item.category}
                          </span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${impactColor}`}>
                            {item.impact} Impact
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground mt-3 group-hover:text-primary transition-colors flex items-center gap-1.5 leading-tight">
                          {item.title}
                        </h4>
                      </CardHeader>
                      <CardContent className="pt-4 flex-1 flex flex-col justify-between space-y-4">
                        <p className="text-xs text-muted-foreground leading-relaxed leading-normal">{item.description}</p>
                        
                        <div className="bg-muted/40 border border-border/40 p-3 rounded-lg flex gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Recommended Action</span>
                            <span className="text-[11px] text-foreground leading-relaxed block font-medium">{item.action}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Chat Tab */
          <div className="border border-border/70 bg-gradient-to-b from-card to-card/95 rounded-xl shadow-sm h-[calc(100vh-210px)] flex flex-col justify-between overflow-hidden">
            {/* Chat History Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto py-10 select-none">
                  <Bot className="w-11 h-11 text-primary mb-3.5 animate-pulse" />
                  <h4 className="text-sm font-bold text-foreground">Interactive AI Business Chat</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Ask me anything about your products, pricing margins, reordering schedules, or marketing ideas. I have secure read access to your local store data.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-8 w-full">
                    {preseededPrompts.map((promptText, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(promptText)}
                        disabled={chatLoading}
                        className="text-left p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 text-[11px] font-medium text-foreground cursor-pointer flex items-center justify-between group"
                      >
                        <span className="leading-snug pr-2">{promptText}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex gap-3 max-w-[85%] ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border ${
                      isUser 
                        ? "bg-primary border-primary/20 text-primary-foreground" 
                        : "bg-muted border-border/80 text-muted-foreground"
                    }`}>
                      {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-primary" />}
                    </div>
                    <div className={`p-3 rounded-2xl shadow-sm text-xs leading-relaxed ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted/50 border border-border/50 text-foreground rounded-tl-none prose prose-invert prose-xs leading-normal max-w-none"
                    }`}>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="flex gap-3 max-w-[85%] mr-auto">
                  <div className="w-8 h-8 rounded-full bg-muted border border-border/80 flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/50 border border-border/50 text-xs text-muted-foreground rounded-tl-none flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-100"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-200"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-300"></span>
                    </span>
                    <span>Analyzing database context...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 border-t border-border/50 bg-muted/10">
              <AI_Prompt
                value={inputText}
                onChange={setInputText}
                onSend={() => handleSendMessage()}
                disabled={chatLoading}
                selectedModel={modelName}
                onModelChange={handleModelChange}
                models={[
                  "gemini-2.5-flash-lite",
                  "gemini-3.1-flash-lite",
                  "gemini-3.5-flash",
                  "gemini-2.5-pro",
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

function Label({ children, className, ...props }: LabelProps) {
  return (
    <label className={`text-xs font-semibold text-foreground ${className}`} {...props}>
      {children}
    </label>
  );
}

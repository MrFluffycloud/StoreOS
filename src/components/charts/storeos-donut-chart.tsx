"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface DonutChartSegment {
  name: string;
  value: number;
  color: string;
}

export interface StoreOSDonutChartProps {
  data: DonutChartSegment[];
  centerLabel?: string;
  centerValue?: string | number;
  height?: number;
  className?: string;
  formatValue?: (value: number) => string;
  showLegend?: boolean;
  maxSegments?: number;
}

export const StoreOSDonutChart = React.memo(function StoreOSDonutChart({
  data,
  centerLabel = "Total",
  centerValue,
  height = 280,
  className,
  formatValue,
  showLegend = true,
  maxSegments = 5,
}: StoreOSDonutChartProps) {
  // Group excess categories into "Others" if data exceeds maxSegments
  const processedData = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    const sorted = [...data].sort((a, b) => b.value - a.value);

    if (sorted.length <= maxSegments) {
      return sorted;
    }

    const top = sorted.slice(0, maxSegments - 1);
    const remaining = sorted.slice(maxSegments - 1);
    const othersValue = remaining.reduce((acc, curr) => acc + curr.value, 0);

    if (othersValue > 0) {
      top.push({
        name: "Others",
        value: othersValue,
        color: "rgb(148, 163, 184)", // clean slate-400 for grouped items
      });
    }

    return top;
  }, [data, maxSegments]);

  const total = React.useMemo(() => {
    return processedData.reduce((acc, curr) => acc + curr.value, 0);
  }, [processedData]);

  const displayCenterValue = centerValue !== undefined ? centerValue : (formatValue ? formatValue(total) : total);

  const fullCenterText = String(displayCenterValue);
  const textLength = fullCenterText.length;

  // Dynamic font sizing based on character count to ensure zero touching with the ring
  let fontSizeClass = "text-xl font-black";
  if (textLength > 12) {
    fontSizeClass = "text-xs font-bold";
  } else if (textLength > 9) {
    fontSizeClass = "text-sm font-black";
  } else if (textLength > 6) {
    fontSizeClass = "text-base font-black";
  }

  const chartConfig: ChartConfig = processedData.reduce((acc, curr) => {
    acc[curr.name] = {
      label: curr.name,
      color: curr.color,
    };
    return acc;
  }, {} as ChartConfig);

  return (
    <div className={cn("w-full flex flex-col items-center justify-center", className)}>
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <ChartContainer config={chartConfig} className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      typeof value === "number" && formatValue
                        ? formatValue(value)
                        : String(value)
                    }
                  />
                }
              />
              <Pie
                data={processedData}
                cx="50%"
                cy="50%"
                innerRadius="65%"
                outerRadius="86%"
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {processedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Center Text with dynamic scaling and hover tooltip */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-auto cursor-help"
          title={`Total Amount: ${fullCenterText}`}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest select-none">
            {centerLabel}
          </span>
          <span className={cn("tracking-tight text-foreground mt-0.5 font-mono max-w-[85%] truncate transition-all duration-200", fontSizeClass)}>
            {fullCenterText}
          </span>
        </div>
      </div>

      {/* Legend */}
      {showLegend && processedData.length > 0 && (
        <div className="w-full mt-4 grid grid-cols-2 gap-2 text-xs">
          {processedData.map((item) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/60 shadow-2xs">
                <div className="flex items-center gap-2.5 truncate">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate font-semibold text-foreground">{item.name}</span>
                </div>
                <span className="text-foreground font-mono font-bold ml-1.5">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface BarChartSeries {
  key: string;
  label: string;
  color?: string;
  stacked?: boolean;
}

export interface StoreOSBarChartProps {
  data: Record<string, any>[];
  xKey: string;
  series: BarChartSeries[];
  height?: number;
  className?: string;
  formatYValue?: (value: number) => string;
  formatXValue?: (value: string) => string;
  showGrid?: boolean;
  stacked?: boolean;
}

export const StoreOSBarChart = React.memo(function StoreOSBarChart({
  data,
  xKey,
  series,
  height = 300,
  className,
  formatYValue,
  formatXValue,
  showGrid = true,
  stacked = false,
}: StoreOSBarChartProps) {
  const chartConfig: ChartConfig = React.useMemo(() => {
    return series.reduce((acc, s) => {
      acc[s.key] = {
        label: s.label,
        color: s.color || "hsl(var(--primary))",
      };
      return acc;
    }, {} as ChartConfig);
  }, [series]);

  return (
    <div className={cn("w-full transition-all duration-300", className)}>
      <ChartContainer config={chartConfig} className="w-full" style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 16, right: 20, left: 10, bottom: 12 }}
            barGap={6}
          >
            {showGrid && (
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                className="stroke-border/60"
              />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              tickFormatter={formatXValue}
              className="text-xs font-semibold fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              tickFormatter={formatYValue}
              className="text-xs font-mono font-medium fill-muted-foreground"
              width={65}
            />
            <Tooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    typeof value === "number" && formatYValue
                      ? formatYValue(value)
                      : String(value)
                  }
                />
              }
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color || "hsl(var(--primary))"}
                stackId={stacked || s.stacked ? "stack" : undefined}
                radius={
                  stacked || s.stacked
                    ? [0, 0, 0, 0]
                    : [6, 6, 0, 0]
                }
                maxBarSize={44}
                isAnimationActive={false}
                className="transition-all duration-200 hover:opacity-85"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
});

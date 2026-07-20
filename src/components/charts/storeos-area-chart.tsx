"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface AreaChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface StoreOSAreaChartProps {
  data: Record<string, any>[];
  xKey: string;
  series: AreaChartSeries[];
  height?: number;
  className?: string;
  formatYValue?: (value: number) => string;
  formatXValue?: (value: string) => string;
  showGrid?: boolean;
}

export const StoreOSAreaChart = React.memo(function StoreOSAreaChart({
  data,
  xKey,
  series,
  height = 300,
  className,
  formatYValue,
  formatXValue,
  showGrid = true,
}: StoreOSAreaChartProps) {
  // Build ChartConfig for shadcn ChartContainer
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
          <AreaChart
            data={data}
            margin={{ top: 16, right: 20, left: 10, bottom: 12 }}
          >
            <defs>
              {series.map((s) => {
                const colorVar = s.color || "hsl(var(--primary))";
                return (
                  <linearGradient
                    key={s.key}
                    id={`area-gradient-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={colorVar} stopOpacity={0.55} />
                    <stop offset="90%" stopColor={colorVar} stopOpacity={0.03} />
                  </linearGradient>
                );
              })}
            </defs>
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
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color || "hsl(var(--primary))"}
                strokeWidth={3}
                fillOpacity={1}
                fill={`url(#area-gradient-${s.key})`}
                isAnimationActive={false}
                activeDot={{
                  r: 6,
                  strokeWidth: 2.5,
                  className: "stroke-background fill-primary shadow-md",
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
});

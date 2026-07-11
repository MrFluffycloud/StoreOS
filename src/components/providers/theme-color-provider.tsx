"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/lib/ipc";

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const themeColor = dbSettings.find((s) => s.key === "theme_color")?.value || "slate";

  useEffect(() => {
    if (themeColor) {
      document.documentElement.setAttribute("data-theme-color", themeColor);
    }
  }, [themeColor]);

  return <>{children}</>;
}

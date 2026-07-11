import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

if (typeof window !== "undefined") {
  const originalMeasure = window.performance.measure;
  window.performance.measure = function() {
    try {
      return originalMeasure.apply(this, arguments as any);
    } catch (e) {
      return {} as any;
    }
  };
}
import QueryProvider from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemeColorProvider } from "@/components/providers/theme-color-provider";
import { AlertProvider } from "@/components/providers/alert-provider";
import AppLayout from "@/components/layout/app-layout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoreOS - Retail Desktop ERP",
  description: "Modern retail ERP for Home & Kitchen retail stores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (typeof window !== 'undefined' && window.performance) {
              var orig = window.performance.measure;
              window.performance.measure = function() {
                try {
                  return orig.apply(this, arguments);
                } catch(e) {
                  return {};
                }
              };
            }
          })();
        `}} />
      </head>
      <body className="h-full overflow-hidden bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <ThemeColorProvider>
              <AlertProvider>
                <AppLayout>{children}</AppLayout>
              </AlertProvider>
            </ThemeColorProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

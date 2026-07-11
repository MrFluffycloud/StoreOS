"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Product } from "@/types/storeos";
import { getSettings, listSystemPrinters, printReceiptSilent } from "@/lib/ipc";
import { Barcode as BarcodeIcon, Printer, Check, X, Info } from "lucide-react";
import JsBarcode from "jsbarcode";

interface BarcodeDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BarcodeDialog({ product, open, onOpenChange }: BarcodeDialogProps) {
  const [labelWidth, setLabelWidth] = useState(50); // mm
  const [labelHeight, setLabelHeight] = useState(25); // mm
  const [copies, setCopies] = useState(1);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeStoreName, setIncludeStoreName] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);

  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  // Fetch settings
  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const storeName = dbSettings.find((s) => s.key === "store_name")?.value || "StoreOS ERP";

  // Fetch printers
  const { data: printers = [] } = useQuery({
    queryKey: ["systemPrinters"],
    queryFn: listSystemPrinters,
  });

  // Set default printer
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinter) {
      const defaultP = dbSettings.find((s) => s.key === "receipt_default_printer")?.value;
      if (defaultP && printers.includes(defaultP)) {
        setSelectedPrinter(defaultP);
      } else {
        setSelectedPrinter(printers[0]);
      }
    }
  }, [printers, dbSettings, selectedPrinter]);

  const barcodeValue = product?.barcode || product?.sku || "";

  // Render barcode SVG preview in the modal
  useEffect(() => {
    if (open && barcodeSvgRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeSvgRef.current, barcodeValue, {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: false, // We'll draw the text manually in the sticker layout
          margin: 0,
        });
      } catch (err) {
        console.error("Barcode generation failed", err);
      }
    }
  }, [open, barcodeValue, includePrice, includeStoreName, labelWidth, labelHeight]);

  if (!product) return null;

  const priceFormatted = (product.priceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency,
  });

  const handlePrint = async () => {
    if (!selectedPrinter) {
      setPrintStatus("Please select a printer.");
      return;
    }

    setPrinting(true);
    setPrintStatus(null);

    try {
      // Get the barcode SVG string
      let barcodeSvgHtml = "";
      if (barcodeSvgRef.current) {
        barcodeSvgHtml = barcodeSvgRef.current.outerHTML;
      }

      // Generate HTML content for the printer
      let labelsHtml = "";
      for (let i = 0; i < copies; i++) {
        labelsHtml += `
          <div class="label-page ${i < copies - 1 ? 'page-break' : ''}">
            ${includeStoreName ? `<div class="store-name">${storeName}</div>` : ""}
            <div class="product-name">${product.name}</div>
            <div class="barcode-container">${barcodeSvgHtml}</div>
            <div class="barcode-text">${barcodeValue}</div>
            ${includePrice ? `<div class="price">${priceFormatted}</div>` : ""}
          </div>
        `;
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @page {
              size: ${labelWidth}mm ${labelHeight}mm;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              font-family: 'Arial', sans-serif;
              -webkit-print-color-adjust: exact;
            }
            .label-page {
              width: ${labelWidth}mm;
              height: ${labelHeight}mm;
              box-sizing: border-box;
              padding: 1.5mm 2mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .store-name {
              font-size: 6pt;
              font-weight: bold;
              text-transform: uppercase;
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
              margin-bottom: 0.2mm;
            }
            .product-name {
              font-size: 7.5pt;
              font-weight: bold;
              text-align: center;
              line-height: 8.5pt;
              max-height: 17pt;
              overflow: hidden;
              width: 100%;
              margin-bottom: 0.5mm;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            }
            .barcode-container {
              display: flex;
              justify-content: center;
              align-items: center;
              height: 7mm;
              width: 90%;
              overflow: hidden;
              margin-bottom: 0.2mm;
            }
            .barcode-container svg {
              height: 100% !important;
              width: 100% !important;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 6pt;
              text-align: center;
              margin-bottom: 0.2mm;
            }
            .price {
              font-size: 9pt;
              font-weight: bold;
              text-align: center;
            }
            .page-break {
              page-break-after: always;
            }
          </style>
        </head>
        <body>
          ${labelsHtml}
        </body>
        </html>
      `;

      const result = await printReceiptSilent(selectedPrinter, fullHtml);
      setPrintStatus(`Success: ${result}`);
    } catch (err: any) {
      console.error("Printing failed", err);
      setPrintStatus(`Failed: ${err.message || err}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border/80 text-card-foreground select-none">
        <DialogHeader className="border-b border-border/50 pb-3">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <BarcodeIcon className="w-4.5 h-4.5 text-primary" /> Barcode Sticker Printer
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {/* Settings Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="printerSelect" className="text-xs font-semibold text-foreground">
                Target Label Printer
              </Label>
              <select
                id="printerSelect"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                {printers.length === 0 ? (
                  <option value="">No printers detected</option>
                ) : (
                  printers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="widthInput" className="text-xs font-semibold text-foreground">
                  Label Width (mm)
                </Label>
                <Input
                  id="widthInput"
                  type="number"
                  value={labelWidth}
                  onChange={(e) => setLabelWidth(Math.max(10, parseInt(e.target.value) || 0))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heightInput" className="text-xs font-semibold text-foreground">
                  Label Height (mm)
                </Label>
                <Input
                  id="heightInput"
                  type="number"
                  value={labelHeight}
                  onChange={(e) => setLabelHeight(Math.max(5, parseInt(e.target.value) || 0))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="copiesInput" className="text-xs font-semibold text-foreground">
                Number of Stickers
              </Label>
              <Input
                id="copiesInput"
                type="number"
                min="1"
                max="1000"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="storeNameCheck"
                  checked={includeStoreName}
                  onChange={(e) => setIncludeStoreName(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary rounded cursor-pointer"
                />
                <Label htmlFor="storeNameCheck" className="text-xs text-muted-foreground font-medium cursor-pointer">
                  Include Shop Name ({storeName})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="priceCheck"
                  checked={includePrice}
                  onChange={(e) => setIncludePrice(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary rounded cursor-pointer"
                />
                <Label htmlFor="priceCheck" className="text-xs text-muted-foreground font-medium cursor-pointer">
                  Include Retail Price ({priceFormatted})
                </Label>
              </div>
            </div>

            {printStatus && (
              <div className={`p-2.5 rounded-lg border text-[11px] flex gap-2 items-start ${
                printStatus.startsWith("Success") 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-500 border-rose-500/20"
              }`}>
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span className="font-medium break-all">{printStatus}</span>
              </div>
            )}

            <Button
              onClick={handlePrint}
              disabled={printing || !selectedPrinter}
              className="w-full h-9.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center gap-1.5 shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              {printing ? "Printing..." : "Print Sticker Labels"}
            </Button>
          </div>

          {/* Interactive Preview Section */}
          <div className="flex flex-col items-center justify-center bg-slate-950/40 rounded-xl border border-border/80 p-6">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">
              Sticker Print Preview
            </span>
            
            {/* White Label Simulator */}
            <div
              style={{
                width: "200px",
                height: `${(labelHeight / labelWidth) * 200}px`,
                maxHeight: "180px",
              }}
              className="bg-white text-black p-3 rounded shadow-md border border-slate-300 flex flex-col items-center justify-between overflow-hidden select-none transition-all duration-300"
            >
              {includeStoreName ? (
                <div className="text-[7px] font-extrabold uppercase tracking-tight text-center leading-none truncate w-full select-none">
                  {storeName}
                </div>
              ) : <div />}
              
              <div className="text-[8.5px] font-bold text-center leading-tight line-clamp-2 select-none w-full break-all px-1">
                {product.name}
              </div>

              {/* Render jsbarcode in a hidden container and clone in layout, or use standard preview container */}
              <div className="flex items-center justify-center h-[35px] w-[95%] overflow-hidden select-none">
                <svg ref={barcodeSvgRef} className="h-full w-full max-h-[35px]" />
              </div>

              <div className="text-[6.5px] font-mono text-center tracking-wider leading-none select-none">
                {barcodeValue}
              </div>

              {includePrice ? (
                <div className="text-[10px] font-black text-center leading-none select-none">
                  {priceFormatted}
                </div>
              ) : <div />}
            </div>
            
            <span className="text-[9px] text-muted-foreground italic mt-3">
              Simulated {labelWidth}mm × {labelHeight}mm thermal label
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

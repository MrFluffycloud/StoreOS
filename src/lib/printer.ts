import { Product } from "@/types/storeos";
import { printReceiptSilent, printReceiptRaw, saveReceiptPdf } from "./ipc";

export interface PrintReceiptItem {
  product: Product;
  qty: number;
}

export interface PrintReceiptDetails {
  receiptId: string;
  timestamp: string;
  customerName: string;
  items: PrintReceiptItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  cashReceivedCents?: number;
  changeDueCents?: number;
  splitCashCents?: number;
  splitElectronicCents?: number;
  remarksText?: string;
  billType?: "GST" | "Estimate";
  gstin?: string;
}

export interface PrintReceiptSettings {
  header: string;
  subtitle: string;
  width: "80mm" | "58mm";
  showDate: boolean;
  showRemarks: boolean;
  footer: string;
  defaultPrinter?: string;
  printMode?: string;
  currency?: string;
}

/**
 * Renders a structured invoice matching the user's grid estimate design template
 * and triggers system hardware printing.
 */
export function printPOSReceipt(details: PrintReceiptDetails, settings: PrintReceiptSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create print iframe
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      console.error("Could not mount print canvas iframe.");
      reject(new Error("Could not mount print canvas iframe."));
      return;
    }

  // Format helper functions
  const getCurrencySymbol = (code?: string) => {
    switch (code?.toUpperCase()) {
      case "INR": return "₹";
      case "EUR": return "€";
      case "GBP": return "£";
      case "USD":
      case "CAD":
      case "AUD":
      default: return "$";
    }
  };

  const formatPrice = (cents: number) => {
    const symbol = getCurrencySymbol(settings.currency);
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const formatQty = (qty: number): string => {
    return qty % 1 === 0 ? qty.toFixed(0) : parseFloat(qty.toFixed(3)).toString();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Grid padding rows (draws columns down to minimum height of 10 rows)
  const minRows = 10;
  const itemsCount = details.items.length;
  const emptyRowsNeeded = Math.max(0, minRows - itemsCount);
  const emptyRowsHtml = Array(emptyRowsNeeded)
    .fill(0)
    .map(
      (_, i) => `
      <tr class="empty-row">
        <td class="border-cell text-center" style="height: 22px;">${itemsCount + i + 1}</td>
        <td class="border-cell"></td>
        <td class="border-cell"></td>
        <td class="border-cell text-center"></td>
        <td class="border-cell text-center"></td>
        <td class="border-cell text-right"></td>
        <td class="border-cell text-right"></td>
      </tr>
    `
    )
    .join("");

  const pageMargin = "6mm";
  const contentWidth = "100%";

  const cgstCents = details.billType === "GST" ? Math.round(details.taxCents / 2) : 0;
  const sgstCents = details.billType === "GST" ? details.taxCents - cgstCents : 0;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt Estimate #${details.receiptId}</title>
        <style>
          @page {
            size: ${settings.width === "58mm" ? "58mm" : "80mm"} auto;
            margin: ${pageMargin};
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8.5px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 0;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .font-bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          
          /* Document type header */
          .document-header {
            font-size: 11px;
            font-weight: bold;
            text-align: center;
            letter-spacing: 1.5px;
            margin-bottom: 10px;
            text-transform: uppercase;
          }

          /* Metadata info block */
          .meta-container {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 8.5px;
          }
          .meta-column {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          /* Grid layout table */
          .grid-table {
            width: ${contentWidth};
            border-collapse: collapse;
            border: 1px solid #000;
            margin-bottom: 0px;
          }
          .grid-table th {
            border: 1px solid #000;
            padding: 4px 2px;
            font-size: 8px;
            font-weight: bold;
            text-align: center;
            background-color: #f8f9fa;
          }
          .grid-table td {
            padding: 4px 3px;
            vertical-align: top;
            font-size: 8px;
          }
          .border-cell {
            border-left: 1px solid #000;
            border-right: 1px solid #000;
            border-bottom: 1px dotted #ccc;
          }
          tr.empty-row td {
            border-bottom: none;
          }
          .grid-table tr:last-child td {
            border-bottom: 1px solid #000;
          }

          /* Summary block */
          .summary-wrapper {
            width: ${contentWidth};
            display: flex;
            justify-content: flex-end;
            margin-top: -1px;
          }
          .summary-table {
            width: 45%;
            border-collapse: collapse;
            border: 1px solid #000;
          }
          .summary-table td {
            border: 1px solid #000;
            padding: 4px 6px;
            font-size: 8.5px;
          }
          .summary-table td.label {
            text-align: right;
            font-weight: bold;
            width: 60%;
          }
          .summary-table td.value {
            text-align: right;
            font-mono;
            font-weight: bold;
            width: 40%;
          }
          
          /* Footer comments block */
          .footer-box {
            margin-top: 10px;
            text-align: center;
            font-size: 7.5px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <!-- Header Title -->
        <div class="document-header" style="margin-bottom: 2px;">
          ${settings.header}
        </div>
        <div class="text-center font-bold uppercase" style="font-size: 9px; letter-spacing: 1.5px; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 3px;">
          ${details.billType === "GST" ? "TAX INVOICE" : "ESTIMATE BILL"}
        </div>

        <!-- Meta Grid -->
        <div class="meta-container">
          <div class="meta-column">
            <div><span class="font-bold">Bill No:</span> ${details.receiptId}</div>
            <div><span class="font-bold">To:</span> ${details.customerName || "General Customer"}</div>
            ${details.billType === "GST" && details.gstin ? `<div><span class="font-bold">GSTIN:</span> ${details.gstin}</div>` : ""}
          </div>
          <div class="meta-column text-right">
            ${settings.showDate ? `<div>${formatTime(details.timestamp)}</div>` : ""}
            ${settings.showDate ? `<div><span class="font-bold">Date:</span> ${formatDate(details.timestamp)}</div>` : ""}
            <div><span class="font-bold">Operator:</span> ${details.remarksText?.includes("system") ? "MHC" : "1"}</div>
          </div>
        </div>

        <!-- Main Items Table -->
        <table class="grid-table">
          <thead>
            <tr>
              <th style="width: 7%;">Sl. No.</th>
              <th style="width: 13%;">Code</th>
              <th style="width: 42%;">Particulars</th>
              <th style="width: 8%;">Disc%</th>
              <th style="width: 10%;">Qty</th>
              <th style="width: 10%;">Rate</th>
              <th style="width: 10%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${details.items
              .map((item, index) => {
                const discPercent = details.discountCents > 0 
                  ? Math.round((details.discountCents / (details.subtotalCents + details.discountCents)) * 100) 
                  : 0;
                
                return `
                  <tr>
                    <td class="border-cell text-center">${index + 1}</td>
                    <td class="border-cell font-bold">${item.product.sku}</td>
                    <td class="border-cell">
                      ${item.product.name}
                      ${details.billType === "GST" && item.product.gstRate ? `<span style="font-size: 7px; font-weight: bold; background: #f1f5f9; padding: 0.5px 2px; border-radius: 2px; margin-left: 3px; border: 0.5px solid #cbd5e1; font-family: monospace;">GST ${item.product.gstRate}%</span>` : ""}
                      ${item.product.brand ? `<div style="font-size: 7.5px; color:#555;">Brand: ${item.product.brand}</div>` : ""}
                    </td>
                    <td class="border-cell text-center">${discPercent}</td>
                    <td class="border-cell text-center font-bold">${formatQty(item.qty)} ${item.product.unit || "PCs"}</td>
                    <td class="border-cell text-right">${formatPrice(item.product.priceCents)}</td>
                    <td class="border-cell text-right font-bold">${formatPrice(item.product.priceCents * item.qty)}</td>
                  </tr>
                `;
              })
              .join("")}
            ${emptyRowsHtml}
          </tbody>
        </table>

        <!-- Totals Grid -->
        <div class="summary-wrapper">
          <table class="summary-table">
            <tr>
              <td class="label">Gross Amount</td>
              <td class="value">${formatPrice(details.subtotalCents + details.discountCents)}</td>
            </tr>
            <tr>
              <td class="label">Discount</td>
              <td class="value">${formatPrice(details.discountCents)}</td>
            </tr>
            ${details.billType === "GST" && details.taxCents > 0 ? `
              <tr>
                <td class="label">CGST (Split)</td>
                <td class="value">${formatPrice(cgstCents)}</td>
              </tr>
              <tr>
                <td class="label">SGST (Split)</td>
                <td class="value">${formatPrice(sgstCents)}</td>
              </tr>
            ` : ""}
            <tr style="background-color: #f8f9fa;">
              <td class="label" style="font-size: 9.5px; font-weight: bold;">TOTAL:</td>
              <td class="value" style="font-size: 9.5px; font-weight: bold;">${formatPrice(details.totalCents)}</td>
            </tr>
          </table>
        </div>

        <!-- Footer Remarks and Notes -->
        <div class="footer-box">
          ${details.remarksText && settings.showRemarks ? `<div style="font-style: italic; margin-bottom: 6px;">Remarks: ${details.remarksText}</div>` : ""}
          <div class="font-bold">${settings.footer}</div>
        </div>
      </body>
    </html>
  `;

  doc.open();
  doc.write(html);
  doc.close();

  // Print execution
  const hasPrinter = settings.defaultPrinter && settings.defaultPrinter.trim() !== "";

  if (hasPrinter) {
    if (settings.printMode === "raw") {
      const rawText = generateRawReceiptText(details, settings);
      printReceiptRaw(settings.defaultPrinter!, rawText)
        .then((res) => {
          console.log("Direct raw print queued successfully:", res);
          document.body.removeChild(iframe);
          resolve();
        })
        .catch((err) => {
          console.error("Direct raw print failed, falling back to silent HTML print:", err);
          printReceiptSilent(settings.defaultPrinter!, html)
            .then((res) => {
              console.log("Direct silent HTML print queued successfully:", res);
              document.body.removeChild(iframe);
              resolve();
            })
            .catch((err2) => {
              console.error("Direct silent HTML print failed, opening window dialog:", err2);
              iframe.contentWindow?.focus();
              setTimeout(() => {
                iframe.contentWindow?.print();
                setTimeout(() => {
                  document.body.removeChild(iframe);
                  resolve();
                }, 1000);
              }, 350);
            });
        });
    } else {
      printReceiptSilent(settings.defaultPrinter!, html)
        .then((res) => {
          console.log("Direct silent HTML print queued successfully:", res);
          document.body.removeChild(iframe);
          resolve();
        })
        .catch((err) => {
          console.error("Direct silent HTML print failed, opening window dialog:", err);
          iframe.contentWindow?.focus();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
              document.body.removeChild(iframe);
              resolve();
            }, 1000);
          }, 350);
        });
    }
  } else {
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        resolve();
      }, 1000);
    }, 350);
  }
  });
}

/**
 * Formats POS receipt parameters into a standard ESC/POS aligned receipt document string
 * for lightning-fast silent hardware printing.
 */
function generateRawReceiptText(details: PrintReceiptDetails, settings: PrintReceiptSettings): string {
  const lineChar = "-";
  const receiptWidthChars = settings.width === "58mm" ? 32 : 40;

  const borderLine = lineChar.repeat(receiptWidthChars);

  // Center align text helper
  const center = (text: string) => {
    if (text.length >= receiptWidthChars) return text.slice(0, receiptWidthChars);
    const leftPad = Math.floor((receiptWidthChars - text.length) / 2);
    return " ".repeat(leftPad) + text;
  };

  // Align left and right columns helper
  const padBetween = (left: string, right: string) => {
    const spaceNeeded = receiptWidthChars - left.length - right.length;
    if (spaceNeeded <= 0) {
      return left.slice(0, receiptWidthChars - right.length - 1) + " " + right;
    }
    return left + " ".repeat(spaceNeeded) + right;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const getCurrencySymbol = (code?: string) => {
    switch (code?.toUpperCase()) {
      case "INR": return "₹";
      case "EUR": return "€";
      case "GBP": return "£";
      case "USD":
      case "CAD":
      case "AUD":
      default: return "$";
    }
  };

  const formatPrice = (cents: number) => {
    const symbol = getCurrencySymbol(settings.currency);
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const formatQty = (qty: number): string => {
    return qty % 1 === 0 ? qty.toFixed(0) : parseFloat(qty.toFixed(3)).toString();
  };

  let out = "";
  out += center(settings.header.toUpperCase()) + "\n";
  if (settings.subtitle) {
    out += center(settings.subtitle) + "\n";
  }
  out += center(details.billType === "GST" ? "TAX INVOICE" : "ESTIMATE BILL") + "\n";
  out += borderLine + "\n";
  out += `Bill No: ${details.receiptId}\n`;
  if (details.billType === "GST" && details.gstin) {
    out += `GSTIN: ${details.gstin}\n`;
  }
  if (settings.showDate) {
    out += `Date: ${formatDate(details.timestamp)}   Time: ${formatTime(details.timestamp)}\n`;
  }
  out += `Customer: ${details.customerName || "General Customer"}\n`;
  out += `Operator: ${details.remarksText?.includes("system") ? "MHC" : "1"}\n`;
  out += borderLine + "\n";

  // Columns header
  if (settings.width === "58mm") {
    out += "Particulars      Qty Rate Amount\n";
  } else {
    out += "Particulars          Qty  Rate   Amount\n";
  }
  out += borderLine + "\n";

  for (const item of details.items) {
    let nameText = item.product.name;
    if (details.billType === "GST" && item.product.gstRate) {
      nameText += ` (${item.product.gstRate}%)`;
    }
    const name = nameText.slice(0, settings.width === "58mm" ? 14 : 18);
    const qtyStr = `${formatQty(item.qty)} ${item.product.unit || "PCs"}`;
    const rateStr = formatPrice(item.product.priceCents);
    const amtStr = formatPrice(item.product.priceCents * item.qty);

    if (settings.width === "58mm") {
      const leftCol = name.padEnd(14);
      const qtyCol = qtyStr.padStart(4);
      const rateCol = rateStr.padStart(6);
      const amtCol = amtStr.padStart(8);
      out += `${leftCol}${qtyCol}${rateCol}${amtCol}\n`;
    } else {
      const leftCol = name.padEnd(18);
      const qtyCol = qtyStr.padStart(6);
      const rateCol = rateStr.padStart(8);
      const amtCol = amtStr.padStart(8);
      out += `${leftCol}${qtyCol}${rateCol}${amtCol}\n`;
    }
  }

  out += borderLine + "\n";
  out += padBetween("Gross Amount:", formatPrice(details.subtotalCents + details.discountCents)) + "\n";
  out += padBetween("Discount:", "-" + formatPrice(details.discountCents)) + "\n";
  if (details.billType === "GST" && details.taxCents > 0) {
    const cgst = Math.round(details.taxCents / 2);
    const sgst = details.taxCents - cgst;
    out += padBetween("CGST (Split):", formatPrice(cgst)) + "\n";
    out += padBetween("SGST (Split):", formatPrice(sgst)) + "\n";
  }
  out += padBetween("TOTAL AMOUNT:", formatPrice(details.totalCents)) + "\n";
  
  if (details.cashReceivedCents) {
    out += padBetween("Cash Tendered:", formatPrice(details.cashReceivedCents)) + "\n";
    out += padBetween("Change Due:", formatPrice(details.changeDueCents || 0)) + "\n";
  }

  out += borderLine + "\n";
  if (details.remarksText && settings.showRemarks) {
    out += `Remarks: ${details.remarksText}\n`;
    out += borderLine + "\n";
  }

  if (settings.footer) {
    out += center(settings.footer) + "\n";
    out += borderLine + "\n";
  }

  // Paper cut ESC/POS commands
  out += "\n\n\n\x1b\x69\n";

  return out;
}

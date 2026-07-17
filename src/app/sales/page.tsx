"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getProducts,
  addInventoryMovement,
  getSetting,
  getSettings,
  listInventoryMovements,
  deleteMovementsByReferencePrefix,
  getLocalIp,
  approveDevice,
  disconnectDevice,
  getInventorySummary,
} from "@/lib/ipc";
import { Product } from "@/types/storeos";
import { printPOSReceipt } from "@/lib/printer";
import { Html5Qrcode } from "html5-qrcode";
import {
  ShoppingCart,
  Trash2,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  Printer,
  DollarSign,
  QrCode,
  CreditCard,
  Percent,
  History,
  Eye,
  Camera,
  ScanBarcode,
} from "lucide-react";
import { useAuth } from "@/components/layout/app-layout";
import { useAlerts } from "@/components/providers/alert-provider";
import { toast } from "sonner";

export default function SalesPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const role = session?.role || "Admin";
  const { showAlert } = useAlerts();
  
  // States
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discountVal, setDiscountVal] = useState(""); // Flat discount in dollars
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "card" | "split">("cash");
  const [billingMode, setBillingMode] = useState<"estimate" | "gst">("estimate");
  const [activeReceiptTab, setActiveReceiptTab] = useState(0);
  
  // Cash calculations
  const [cashReceived, setCashReceived] = useState("");
  
  // Split calculations
  const [splitCash, setSplitCash] = useState("");
  const [splitElectronic, setSplitElectronic] = useState("");

  // Customer & Logistics details
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [remarks, setRemarks] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [godown, setGodown] = useState("Primary");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptDetails, setReceiptDetails] = useState<any>(null);

  // Past Sales History States
  const [pastSalesOpen, setPastSalesOpen] = useState(false);
  const [selectedPastSale, setSelectedPastSale] = useState<any | null>(null);
  const [pastSalesSearch, setPastSalesSearch] = useState("");

  // Receipt Mode States
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);
  const [isEditingPastReceipt, setIsEditingPastReceipt] = useState(false);

  const isLocked = viewingReceiptId !== null && !isEditingPastReceipt;

  // Camera scanner states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  // Mobile pairing states
  const [pairingPin, setPairingPin] = useState("");
  const [localIp, setLocalIp] = useState("192.168.137.1");
  const [activeIpIndex, setActiveIpIndex] = useState(0);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ ip: string; pin: string } | null>(null);
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
  const [scanConfirmProduct, setScanConfirmProduct] = useState<Product | null>(null);
  const [scanConfirmQty, setScanConfirmQty] = useState(1);
  const [printStatus, setPrintStatus] = useState<"spooling" | "success" | "error" | null>(null);
  const [printProgress, setPrintProgress] = useState(0);

  // Queries
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const { data: taxRateStr = "0.0825" } = useQuery({
    queryKey: ["setting", "tax_rate"],
    queryFn: () => getSetting("tax_rate").then((v) => v || "0.0825"),
  });

  const { data: storeName = "StoreOS Kitchen" } = useQuery({
    queryKey: ["setting", "store_name"],
    queryFn: () => getSetting("store_name").then((v) => v || "StoreOS Kitchen"),
  });

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: listInventoryMovements,
  });

  const { data: inventorySummary = [] } = useQuery({
    queryKey: ["inventorySummary"],
    queryFn: getInventorySummary,
  });

  const getProductStock = (productId: string): number => {
    const summary = inventorySummary.find((s) => s.productId === productId);
    return summary ? summary.currentStock : 0;
  };

  // Group past sales dynamically from movements
  const salesMap = new Map<string, any>();
  movements.forEach((m) => {
    if (m.referenceType === "POSReceipt" && m.movementType === "Sale") {
      const refId = m.referenceId || "UNGROUPED";
      let receiptId = refId;
      let custName = "General Customer";
      let godownName = "Primary";
      let vehicleNum = "None";
      let remarksText = "None";
      let discountValParsed = "0";
      let discountTypeParsed = "flat";
      let paymentMethodParsed = "cash";
      let cashReceivedParsed = "";
      let splitCashParsed = "";
      let splitElectronicParsed = "";
      let billTypeParsed = "Estimate";

      if (refId.includes(" | ")) {
        const parts = refId.split(" | ");
        receiptId = parts[0];
        parts.forEach((p) => {
          if (p.startsWith("Cust: ")) custName = p.replace("Cust: ", "");
          if (p.startsWith("Godown: ")) godownName = p.replace("Godown: ", "");
          if (p.startsWith("Vehicle: ")) vehicleNum = p.replace("Vehicle: ", "");
          if (p.startsWith("Remarks: ")) remarksText = p.replace("Remarks: ", "");
          if (p.startsWith("Discount: ")) discountValParsed = p.replace("Discount: ", "");
          if (p.startsWith("DiscType: ")) discountTypeParsed = p.replace("DiscType: ", "");
          if (p.startsWith("Pay: ")) paymentMethodParsed = p.replace("Pay: ", "");
          if (p.startsWith("CashRec: ")) cashReceivedParsed = p.replace("CashRec: ", "");
          if (p.startsWith("SplitCash: ")) splitCashParsed = p.replace("SplitCash: ", "");
          if (p.startsWith("SplitElec: ")) splitElectronicParsed = p.replace("SplitElec: ", "");
          if (p.startsWith("BillType: ")) billTypeParsed = p.replace("BillType: ", "");
        });
      }

      const prod = products.find(p => p.id === m.productId);
      const priceCents = prod ? prod.priceCents : 0;

      if (!salesMap.has(receiptId)) {
        salesMap.set(receiptId, {
          receiptId,
          billType: billTypeParsed,
          customerName: custName,
          godownName,
          vehicleNum,
          remarksText,
          discountVal: discountValParsed,
          discountType: discountTypeParsed,
          paymentMethod: paymentMethodParsed,
          cashReceived: cashReceivedParsed,
          splitCash: splitCashParsed,
          splitElectronic: splitElectronicParsed,
          timestamp: m.timestamp,
          items: [],
          totalCents: 0,
        });
      }

      const sale = salesMap.get(receiptId);
      const qty = Math.abs(m.quantity);
      sale.items.push({
        product: prod || { name: m.productId, sku: "Unknown", priceCents: 0 },
        qty,
      });
      sale.totalCents += priceCents * qty;
    }
  });

  const pastSales = Array.from(salesMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .filter((s) => {
      const q = pastSalesSearch.toLowerCase();
      return (
        s.receiptId.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q)
      );
    });

  const taxRate = parseFloat(taxRateStr);
  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const getCurrencySymbol = (code: string) => {
    switch (code.toUpperCase()) {
      case "INR": return "₹";
      case "EUR": return "€";
      case "GBP": return "£";
      case "USD":
      case "CAD":
      case "AUD":
      default: return "$";
    }
  };
  const currencySymbol = getCurrencySymbol(currency);
  const idFormat = dbSettings.find((s) => s.key === "product_id_format")?.value || "sku_barcode";
  const isSerialMode = idFormat === "sku_serial";

  const receiptHeader = dbSettings.find((s) => s.key === "receipt_header")?.value || storeName;
  const receiptSubtitle = dbSettings.find((s) => s.key === "receipt_subtitle")?.value || "Home & Kitchen Retail Store";
  const receiptWidth = dbSettings.find((s) => s.key === "receipt_width")?.value || "80mm";
  const receiptShowDate = dbSettings.find((s) => s.key === "receipt_show_date")?.value || "true";
  const receiptShowRemarks = dbSettings.find((s) => s.key === "receipt_show_remarks")?.value || "true";
  const receiptFooter = dbSettings.find((s) => s.key === "receipt_footer")?.value || "Thank you for shopping!";

  const isDecimalUnit = (unit?: string): boolean => {
    if (!unit) return false;
    const u = unit.toLowerCase();
    return u === "kgs" || u === "ltrs" || u === "mtrs" || u === "kg" || u === "ltr" || u === "mtr";
  };

  const formatQty = (qty: number): string => {
    return qty % 1 === 0 ? qty.toFixed(0) : parseFloat(qty.toFixed(3)).toString();
  };

  // Dynamic price formatting helper
  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: currency,
    });
  };

  // Filter products based on search term
  const searchResults = productSearch && !isLocked
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
          (p.barcode && p.barcode.includes(productSearch))
      )
    : [];

  const addToCart = async (product: Product, qtyToAdd: number = 1) => {
    if (isLocked) return;
    const availableStock = getProductStock(product.id);
    const existing = cart.find((item) => item.product.id === product.id);
    const currentCartQty = existing ? existing.qty : 0;

    if (currentCartQty + qtyToAdd > availableStock) {
      await showAlert(`Cannot add to cart. Only ${availableStock} units of "${product.name}" available in stock (Cart currently has ${currentCartQty}).`, "Out of Stock", "warning");
      return;
    }

    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + qtyToAdd } : item
        )
      );
    } else {
      setCart([...cart, { product, qty: qtyToAdd }]);
    }
    setProductSearch("");
  };

  const handleBarcodeScanned = async (barcodeText: string, qty: number = 1) => {
    if (isLocked) return;
    const code = barcodeText.trim().toLowerCase();
    if (!code) return;

    const matched = products.find(
      (p) => (p.barcode && p.barcode.toLowerCase() === code) || p.sku.toLowerCase() === code
    );

    if (matched) {
      await addToCart(matched, qty);
    } else {
      await showAlert(`No product found with barcode or SKU matching: "${barcodeText}"`, "Not Found", "warning");
    }
  };

  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (isLocked) return;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === "Enter") {
        const barcode = buffer.trim();
        if (barcode.length > 2) {
          handleBarcodeScanned(barcode);
          buffer = "";
          e.preventDefault();
        }
        buffer = "";
        return;
      }

      if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      if (!isInput || timeDiff < 50) {
        buffer += e.key;
        if (buffer.length > 50) {
          buffer = buffer.substring(1);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, [products, cart, isLocked]);

  useEffect(() => {
    let unlisten: () => void = () => {};
    let active = true;

    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const fn = await listen<string>("mobile-scan", (event) => {
          if (active) {
            try {
              const data = JSON.parse(event.payload);
              if (data && typeof data === "object" && data.barcode) {
                handleBarcodeScanned(data.barcode, data.qty || 1);
              } else {
                handleBarcodeScanned(event.payload, 1);
              }
            } catch (e) {
              handleBarcodeScanned(event.payload, 1);
            }
          }
        });
        unlisten = fn;
      } catch (err) {
        console.error("Could not bind mobile scan listener:", err);
      }
    };

    setupListener();

    return () => {
      active = false;
      unlisten();
    };
  }, [products, cart]);

  // Generate pairing pin and fetch local PC IP on mount
  useEffect(() => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setPairingPin(pin);
    
    getLocalIp().then((ip) => {
      setLocalIp(ip);
    });
  }, []);

  // Listen to mobile device pairing requests
  useEffect(() => {
    let unlisten: any;
    let active = true;

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const fn = await listen<string>("mobile-connect-request", (event) => {
          if (active) {
            // event.payload contains IP and PIN
            try {
              const data = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
              if (data.pin === pairingPin) {
                setPendingRequest(data);
              }
            } catch (e) {
              console.error("Failed to parse request JSON", e);
            }
          }
        });
        unlisten = fn;
      } catch (err) {
        console.error(err);
      }
    };

    if (pairingPin) {
      setup();
    }

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [pairingPin]);

  const startCamera = async (deviceId?: string) => {
    try {
      const devices = await Html5Qrcode.getCameras();
      setCameraDevices(devices);
      
      const targetId = deviceId || selectedCameraId || (devices.length > 0 ? devices[0].id : "");
      if (targetId) {
        setSelectedCameraId(targetId);
      }

      // Small timeout to let DOM mount target div "reader"
      setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode("reader");
          (window as any).html5QrCodeInstance = html5QrCode;
          
          const config = { fps: 10, qrbox: { width: 220, height: 120 } };
          const cameraSource = targetId ? { deviceId: targetId } : { facingMode: "environment" };
          
          await html5QrCode.start(
            cameraSource,
            config,
            (decodedText) => {
              const code = decodedText.trim().toLowerCase();
              const matched = products.find(
                (p) => (p.barcode && p.barcode.toLowerCase() === code) || p.sku.toLowerCase() === code
              );
              if (matched) {
                if ((window as any).html5QrCodeInstance) {
                  (window as any).html5QrCodeInstance.pause();
                }
                setScanConfirmQty(1);
                setScanConfirmProduct(matched);
              } else {
                showAlert(`No product found matching code: "${decodedText}"`, "Scan Error", "warning");
              }
            },
            (errorMessage) => {}
          );
          setCameraActive(true);
        } catch (err) {
          console.error("HTML5QRCODE start error", err);
        }
      }, 300);
    } catch (err) {
      console.error(err);
      showAlert("Could not start camera scanning session.", "Camera Error", "error");
    }
  };

  const stopCamera = async () => {
    const instance = (window as any).html5QrCodeInstance;
    if (instance && instance.isScanning) {
      try {
        await instance.stop();
        setCameraActive(false);
      } catch (err) {
        console.error("HTML5QRCODE stop error", err);
      }
    }
  };

  const updateQty = async (productId: string, delta: number) => {
    if (isLocked) return;

    if (delta > 0) {
      const item = cart.find((it) => it.product.id === productId);
      if (item) {
        const availableStock = getProductStock(productId);
        if (item.qty + delta > availableStock) {
          await showAlert(`Cannot increase quantity. Only ${availableStock} units of "${item.product.name}" available in stock.`, "Out of Stock", "warning");
          return;
        }
      }
    }

    setCart(
      cart
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return { ...item, qty: newQty };
          }
          return item;
        })
        .filter((item) => item.qty > 0)
    );
  };

  const setQtyDirectly = async (productId: string, value: number) => {
    if (isLocked) return;
    if (isNaN(value) || value < 0) return;

    const item = cart.find((it) => it.product.id === productId);
    if (item) {
      const availableStock = getProductStock(productId);
      if (value > availableStock) {
        await showAlert(`Cannot set quantity. Only ${availableStock} units of "${item.product.name}" available in stock.`, "Out of Stock", "warning");
        return;
      }
    }

    setCart(
      cart
        .map((item) => {
          if (item.product.id === productId) {
            return { ...item, qty: value };
          }
          return item;
        })
        .filter((item) => item.qty > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    if (isLocked) return;
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountVal("");
    setDiscountType("flat");
    setCashReceived("");
    setSplitCash("");
    setSplitElectronic("");
    setCustomerName("");
    setCustomerAddress("");
    setRemarks("");
    setVehicleNo("");
    setGodown("Primary");
  };

  // Cart Pricing calculations
  const rawSubtotalCents = cart.reduce(
    (acc, item) => acc + item.product.priceCents * item.qty,
    0
  );

  const discountAmount = parseFloat(discountVal || "0");
  const discountCents =
    discountType === "flat"
      ? Math.round(discountAmount * 100)
      : Math.round(rawSubtotalCents * (discountAmount / 100));

  const subtotalCents = Math.max(0, rawSubtotalCents - discountCents);

  // Calculate tax based on Billing Mode
  const gstItems = cart.filter(item => (item.product.gstRate || 0) > 0);
  const estItems = cart.filter(item => (item.product.gstRate || 0) === 0);
  const discountRatio = rawSubtotalCents > 0 ? (discountCents / rawSubtotalCents) : 0;
  const taxCents = billingMode === "gst"
    ? cart.reduce((acc, item) => {
        const itemSubtotal = item.product.priceCents * item.qty;
        const itemDiscount = Math.round(itemSubtotal * discountRatio);
        const itemSubtotalAfterDiscount = Math.max(0, itemSubtotal - itemDiscount);
        const itemGstRate = item.product.gstRate || 0;
        return acc + Math.round(itemSubtotalAfterDiscount * (itemGstRate / 100));
      }, 0)
    : 0; // Estimate mode has 0 tax

  const totalCents = subtotalCents + taxCents;

  const costCents = cart.reduce(
    (acc, item) => acc + item.product.costCents * item.qty,
    0
  );

  const profitCents = subtotalCents - costCents;
  const marginPercentage = subtotalCents > 0 ? (profitCents / subtotalCents) * 100 : 0;

  // Cash payment validation
  const cashReceivedCents = Math.round(parseFloat(cashReceived || "0") * 100);
  const changeDueCents = cashReceivedCents - totalCents;
  const isCashValid = paymentMethod === "cash" ? cashReceivedCents >= totalCents : true;

  // Split validation
  const splitCashCents = Math.round(parseFloat(splitCash || "0") * 100);
  const splitElectronicCents = Math.round(parseFloat(splitElectronic || "0") * 100);
  const isSplitValid = paymentMethod === "split" ? (splitCashCents + splitElectronicCents === totalCents) : true;

  const isCartStockValid = cart.every(
    (item) => item.qty <= getProductStock(item.product.id)
  );

  const canCheckout = cart.length > 0 && isCashValid && isSplitValid && isCartStockValid;

  const storeGstin = dbSettings.find((s) => s.key === "store_gstin")?.value || "";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const baseReceiptId = viewingReceiptId || `REC-${Date.now().toString().slice(-6)}`;
      
      // If updating a past sale, clean its previous movements
      if (viewingReceiptId) {
        await deleteMovementsByReferencePrefix(viewingReceiptId);
      }

      const gstItems = cart.filter(item => (item.product.gstRate || 0) > 0);
      const estItems = cart.filter(item => (item.product.gstRate || 0) === 0);

      let receiptsToCreate: Array<{
        receiptId: string;
        billType: "GST" | "Estimate";
        items: typeof cart;
      }> = [];

      if (billingMode === "estimate") {
        receiptsToCreate.push({
          receiptId: `${baseReceiptId}-EST`,
          billType: "Estimate",
          items: [...cart]
        });
      } else {
        // GST mode
        if (gstItems.length > 0) {
          receiptsToCreate.push({
            receiptId: `${baseReceiptId}-GST`,
            billType: "GST",
            items: gstItems
          });
        }
        if (estItems.length > 0) {
          receiptsToCreate.push({
            receiptId: `${baseReceiptId}-EST`,
            billType: "Estimate",
            items: estItems
          });
        }
      }

      const createdReceipts = [];

      for (const rec of receiptsToCreate) {
        const recRawSubtotal = rec.items.reduce((acc, item) => acc + item.product.priceCents * item.qty, 0);
        const recCost = rec.items.reduce((acc, item) => acc + item.product.costCents * item.qty, 0);
        
        // Pro-rate discount
        const recDiscount = rawSubtotalCents > 0
          ? Math.round(discountCents * (recRawSubtotal / rawSubtotalCents))
          : 0;
        
        const recSubtotal = Math.max(0, recRawSubtotal - recDiscount);
        
        // Tax
        const recTax = rec.billType === "GST"
          ? rec.items.reduce((acc, item) => {
              const itemSubtotal = item.product.priceCents * item.qty;
              const itemDisc = rawSubtotalCents > 0 ? Math.round(discountCents * (itemSubtotal / rawSubtotalCents)) : 0;
              const itemSubtotalAfterDiscount = Math.max(0, itemSubtotal - itemDisc);
              const itemGstRate = item.product.gstRate || 0;
              return acc + Math.round(itemSubtotalAfterDiscount * (itemGstRate / 100));
            }, 0)
          : 0;
          
        const recTotal = recSubtotal + recTax;
        const recProfit = recSubtotal - recCost;

        // Allocate payments proportionally to receipt total
        const paymentRatio = totalCents > 0 ? (recTotal / totalCents) : 0;
        
        const recCashReceivedCents = Math.round(cashReceivedCents * paymentRatio);
        const recChangeDueCents = paymentMethod === "cash" ? Math.max(0, recCashReceivedCents - recTotal) : 0;
        
        const recSplitCashCents = Math.round(splitCashCents * paymentRatio);
        const recSplitElectronicCents = Math.round(splitElectronicCents * paymentRatio);

        const recRefId = `${rec.receiptId} | BillType: ${rec.billType} | Cust: ${customerName || "General Customer"} | Godown: ${godown} | Vehicle: ${vehicleNo || "None"} | Remarks: ${remarks || "None"} | Discount: ${discountVal || "0"} | DiscType: ${discountType} | Pay: ${paymentMethod} | CashRec: ${(recCashReceivedCents/100).toFixed(2)} | SplitCash: ${(recSplitCashCents/100).toFixed(2)} | SplitElec: ${(recSplitElectronicCents/100).toFixed(2)}`;

        // Save inventory movements
        for (const item of rec.items) {
          await addInventoryMovement({
            productId: item.product.id,
            quantity: -item.qty,
            movementType: "Sale",
            referenceType: "POSReceipt",
            referenceId: recRefId,
            employeeId: "system",
          });
        }

        createdReceipts.push({
          receiptId: rec.receiptId,
          billType: rec.billType,
          items: rec.items,
          subtotalCents: recSubtotal,
          discountCents: recDiscount,
          taxCents: recTax,
          totalCents: recTotal,
          profitCents: recProfit,
          paymentMethod,
          cashReceivedCents: paymentMethod === "cash" ? recCashReceivedCents : 0,
          changeDueCents: recChangeDueCents,
          splitCashCents: paymentMethod === "split" ? recSplitCashCents : 0,
          splitElectronicCents: paymentMethod === "split" ? recSplitElectronicCents : 0,
          timestamp: new Date().toISOString(),
          customerName: customerName || "General Customer",
          godown,
          remarks,
          storeGstin,
        });
      }

      return {
        isSplit: createdReceipts.length > 1,
        receipts: createdReceipts,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      
      setViewingReceiptId(null);
      setIsEditingPastReceipt(false);
      setReceiptDetails(data);
      setActiveReceiptTab(0);
      setReceiptOpen(true);
      clearCart();

      toast.success("Checkout Completed", {
        description: data.isSplit
          ? `Successfully checked out: generated ${data.receipts.length} split receipts.`
          : "Receipt successfully checked out.",
      });
    },
    onError: (err: any) => {
      toast.error("Checkout Failed", {
        description: err.message || "An unexpected error occurred during checkout.",
      });
    },
  });

  return (
    <>
      {printStatus && (
        <div className="fixed top-0 left-0 w-full h-1.5 z-[100] bg-slate-800/10 backdrop-blur-xs">
          <div 
            className={`h-full transition-all duration-300 ${
              printStatus === "success" 
                ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" 
                : printStatus === "error" 
                ? "bg-rose-500 shadow-[0_0_8px_#f43f5e]" 
                : "bg-blue-500 shadow-[0_0_8px_#3b82f6]"
            }`}
            style={{ width: `${printProgress}%` }}
          />
          <div className="fixed top-3 right-6 bg-slate-950/95 text-white rounded-lg px-3 py-1.5 text-xs font-semibold shadow-md flex items-center gap-2 border border-slate-800/50 animate-in fade-in slide-in-from-top-2 duration-200">
            {printStatus === "spooling" && (
              <>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>Spooling print job...</span>
              </>
            )}
            {printStatus === "success" && (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Print job spooled!</span>
              </>
            )}
            {printStatus === "error" && (
              <>
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Failed to spool receipt.</span>
              </>
            )}
          </div>
        </div>
      )}
      <PageContainer
        title="Point of Sale (POS)"
        subtitle="Process customer transactions, apply flat discounts, calculate profit, and record payments"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPastSalesOpen(true)}
          className="flex items-center gap-1.5 h-8.5 text-xs font-semibold"
        >
          <History className="w-3.5 h-3.5" />
          Past Sales Receipts
        </Button>
      }
    >
      <div className="grid gap-6 md:grid-cols-3 h-full select-none">
        {/* Left Column: Cart items and Search */}
        <div className="md:col-span-2 flex flex-col space-y-4 h-full overflow-hidden">
          {/* Active past receipt status banner */}
          {viewingReceiptId && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-600">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-500" />
                <span>
                  Viewing Past Receipt <strong>#{viewingReceiptId}</strong> ({isEditingPastReceipt ? "Edit Mode" : "Read-Only Mode"})
                </span>
              </div>
              <div className="flex gap-2">
                {!isEditingPastReceipt && (
                  <Button
                    size="sm"
                    onClick={() => setIsEditingPastReceipt(true)}
                    className="h-7 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                  >
                    Edit Receipt
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewingReceiptId(null);
                    setIsEditingPastReceipt(false);
                    clearCart();
                  }}
                  className="h-7 text-[10px] border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                >
                  Exit Review
                </Button>
              </div>
            </div>
          )}

          {/* Product Search & Dropdown */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleBarcodeScanned(productSearch);
                      e.preventDefault();
                    }
                  }}
                  placeholder={isLocked ? "Receipt is in Read-Only Mode" : `Search by SKU, name, or ${isSerialMode ? "serial number" : "barcode"}...`}
                  disabled={isLocked}
                  className="pl-9 h-10 text-xs bg-muted/50 focus-visible:ring-primary w-full"
                />
              </div>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCameraOpen(true);
                  startCamera();
                }}
                disabled={isLocked}
                className="h-10 px-3 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 border border-input flex items-center justify-center gap-1.5 text-xs font-semibold"
                title="Scan using camera"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Camera</span>
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setMobileSetupOpen(true)}
                disabled={isLocked}
                className={`h-10 px-3 shrink-0 border border-input flex items-center justify-center gap-1.5 text-xs font-semibold ${
                  connectedDevice 
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20" 
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
                title="Connect mobile phone as barcode scanner"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${connectedDevice ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"}`} />
                <QrCode className="w-4 h-4" />
                <span>{connectedDevice ? "Phone Active" : "Link Phone"}</span>
              </Button>
            </div>

            {/* Results Popover */}
            {searchResults.length > 0 && !isLocked && (
              <div className="absolute top-11 left-0 right-0 z-50 rounded-md border border-border bg-card shadow-lg max-h-56 overflow-y-auto">
                <div className="p-1">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={isLocked}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-xs rounded hover:bg-muted transition-colors text-foreground"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
                          <span>SKU: {p.sku} {p.barcode ? `| ${isSerialMode ? "SN" : "UPC"}: ${p.barcode}` : ""}</span>
                          <span className={`px-1 py-0.2 rounded font-sans text-[8px] font-bold tracking-wide uppercase ${
                            getProductStock(p.id) > 0 
                              ? getProductStock(p.id) < 25 
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" 
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          }`}>
                            {getProductStock(p.id) > 0 ? `${getProductStock(p.id)} Stock` : "Out of stock"}
                          </span>
                        </span>
                      </div>
                      <span className="font-mono font-semibold">
                        {formatPrice(p.priceCents)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Checkout Cart ({cart.length})
            </h2>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                disabled={isLocked}
                className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Cart
              </Button>
            )}
          </div>

          {/* Cart List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-lg border-border/80">
                <ShoppingCart className="w-8 h-8 text-muted-foreground/60 mb-2" />
                <span className="text-xs text-muted-foreground">Your shopping cart is empty.</span>
                <span className="text-[10px] text-muted-foreground/60 mt-1">Search for products above to begin.</span>
              </div>
            ) : (
              cart.map((item) => (
                <Card key={item.product.id} className="border border-border bg-card shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-foreground">{item.product.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center gap-1.5">
                        <span>SKU: {item.product.sku}</span>
                        <span>•</span>
                        <span className={item.qty > getProductStock(item.product.id) ? "text-rose-500 font-bold" : ""}>
                          Stock: {getProductStock(item.product.id)} available
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      {/* Quantity Toggles */}
                      {isDecimalUnit(item.product.unit) ? (
                        <div className="flex items-center gap-1.5 select-none">
                          <Input
                            type="number"
                            step="0.05"
                            min="0"
                            disabled={isLocked}
                            value={item.qty}
                            onChange={(e) => setQtyDirectly(item.product.id, parseFloat(e.target.value))}
                            className="h-7 w-[70px] text-xs font-mono text-center border-border/60 bg-muted/20 px-1.5 focus:outline-none"
                          />
                          <span className="text-[10px] font-bold text-muted-foreground font-mono">{item.product.unit}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <Button
                            variant="outline"
                            onClick={() => updateQty(item.product.id, -1)}
                            disabled={isLocked}
                            className="w-6 h-6 p-0 rounded-md text-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="font-mono text-xs font-semibold px-1 text-center min-w-[50px]">{item.qty} {item.product.unit || "PCs"}</span>
                          <Button
                            variant="outline"
                            onClick={() => updateQty(item.product.id, 1)}
                            disabled={isLocked}
                            className="w-6 h-6 p-0 rounded-md text-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {/* Price Tag */}
                      <span className="font-mono text-xs font-semibold w-20 text-right">
                        {formatPrice(item.product.priceCents * item.qty)}
                      </span>
                      {/* Delete */}
                      <Button
                        variant="ghost"
                        onClick={() => removeFromCart(item.product.id)}
                        disabled={isLocked}
                        className="w-7 h-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Checkout panel */}
        <div className="flex flex-col space-y-4">
          {/* Profitability Panel (Visible to Clerks/Auditors) */}
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-primary" /> Estimated Profit
                </span>
                <span className="font-mono font-semibold text-emerald-500">
                  {formatPrice(profitCents)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Profit Margin</span>
                <span className="font-mono">{marginPercentage.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Panel */}
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground border-b pb-2 flex items-center justify-between">
                <span>Order Summary</span>
              </h2>

              {/* Billing Mode Selector */}
              <div className="space-y-1.5 pb-2 border-b border-border/30">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Billing Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={billingMode === "estimate" ? "default" : "outline"}
                    onClick={() => {
                      if (!isLocked) setBillingMode("estimate");
                    }}
                    disabled={isLocked}
                    className="h-8 text-xs font-semibold"
                  >
                    Estimate Bill
                  </Button>
                  <Button
                    type="button"
                    variant={billingMode === "gst" ? "default" : "outline"}
                    onClick={() => {
                      if (!isLocked) setBillingMode("gst");
                    }}
                    disabled={isLocked}
                    className="h-8 text-xs font-semibold"
                  >
                    GST / Split Bill
                  </Button>
                </div>
              </div>

              {/* Split Warning */}
              {billingMode === "gst" && gstItems.length > 0 && estItems.length > 0 && (
                <div className="text-[9px] text-amber-500 font-semibold leading-normal bg-amber-500/10 p-2.5 rounded border border-amber-500/20 mt-1">
                  ℹ️ Mixed Cart: Contains {gstItems.length} GST and {estItems.length} Non-GST items. This will generate 2 bills at checkout.
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono text-foreground">
                    {formatPrice(rawSubtotalCents)}
                  </span>
                </div>
                
                {/* Discount input */}
                <div className="flex items-center justify-between gap-2 py-1.5 border-t border-b border-dashed border-border/50">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      Discount
                    </span>
                    <div className="flex rounded border border-border overflow-hidden bg-muted/20">
                      <button
                        type="button"
                        onClick={() => setDiscountType("flat")}
                        disabled={isLocked}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                          discountType === "flat"
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {currencySymbol}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("percent")}
                        disabled={isLocked}
                        className={`px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                          discountType === "percent"
                            ? "bg-primary text-primary-foreground font-bold"
                            : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step={discountType === "percent" ? "1" : "0.01"}
                    placeholder="0.00"
                    value={discountVal}
                    onChange={(e) => setDiscountVal(e.target.value)}
                    disabled={isLocked}
                    className="h-7 text-xs font-mono text-right max-w-[90px] border-border/60 bg-muted/20"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {billingMode === "gst" ? "GST Tax (Itemized)" : "Sales Tax (Estimate)"}
                  </span>
                  <span className="font-mono text-foreground">
                    {formatPrice(taxCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold border-t pt-2.5">
                  <span className="text-foreground">Total Due</span>
                  <span className="font-mono text-foreground text-base">
                    {formatPrice(totalCents)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer & Logistics Details Panel */}
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-4 space-y-3">
              <button
                type="button"
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="w-full flex items-center justify-between text-xs font-semibold tracking-wider uppercase text-muted-foreground focus:outline-none"
              >
                <span>Customer & Logistics</span>
                <span className="text-[10px] text-primary hover:underline font-bold">
                  {detailsOpen ? "Hide Details" : "Show (Optional)"}
                </span>
              </button>

              {detailsOpen && (
                <div className="space-y-2.5 pt-2 border-t border-border/40 text-[10px] select-none">
                  <div className="space-y-1">
                    <Label htmlFor="custName" className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Customer Name</Label>
                    <Input
                      id="custName"
                      placeholder="e.g. Arthur Dent"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={isLocked}
                      className="h-7 text-xs bg-muted/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="custAddress" className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Billing Address</Label>
                    <Input
                      id="custAddress"
                      placeholder="Street, City Address"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      disabled={isLocked}
                      className="h-7 text-xs bg-muted/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="saleGodown" className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Source Godown</Label>
                      <select
                        id="saleGodown"
                        value={godown}
                        onChange={(e) => setGodown(e.target.value)}
                        disabled={isLocked}
                        className="flex h-7 w-full rounded border border-input bg-muted/20 px-2 text-xs text-foreground focus:outline-none"
                      >
                        <option value="Primary">Primary Shopfloor</option>
                        <option value="Godown A">Godown A Warehouse</option>
                        <option value="Godown B">Godown B Warehouse</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="saleVehicle" className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Vehicle Number</Label>
                      <Input
                        id="saleVehicle"
                        placeholder="e.g. DL-3C-AB-1234"
                        value={vehicleNo}
                        onChange={(e) => setVehicleNo(e.target.value)}
                        disabled={isLocked}
                        className="h-7 text-xs bg-muted/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="saleRemarks" className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Remarks / Bill Memo</Label>
                    <Input
                      id="saleRemarks"
                      placeholder="Special bill annotations"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      disabled={isLocked}
                      className="h-7 text-xs bg-muted/20"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Panel */}
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground border-b pb-2">
                Payment Method
              </h2>
              
              {/* Payment Select Buttons */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cash", label: "Cash", icon: DollarSign },
                  { id: "upi", label: "UPI QR", icon: QrCode },
                  { id: "card", label: "Card", icon: CreditCard },
                  { id: "split", label: "Split", icon: Plus },
                ].map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={paymentMethod === item.id ? "default" : "outline"}
                    onClick={() => {
                      if (!isLocked) setPaymentMethod(item.id as any);
                    }}
                    disabled={isLocked}
                    className="h-9.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Button>
                ))}
              </div>

              {/* Cash payment panel */}
              {paymentMethod === "cash" && (
                <div className="space-y-3 bg-muted/40 p-3 rounded-lg border border-border/40 mt-1 animate-fade-in">
                  <div className="space-y-1.5">
                    <Label htmlFor="cashReceived" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Cash Tendered
                    </Label>
                    <Input
                      id="cashReceived"
                      type="number"
                      placeholder="0.00"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      disabled={isLocked}
                      className="h-8.5 text-xs font-mono bg-background border-border/80"
                    />
                  </div>
                  {cashReceived && (
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-border/30">
                      <span className="font-semibold text-muted-foreground">Change Due:</span>
                      <span className={`font-mono font-bold ${changeDueCents >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {changeDueCents >= 0 ? (
                          formatPrice(changeDueCents)
                        ) : (
                          "Insufficient Cash"
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Split payment panel */}
              {paymentMethod === "split" && (
                <div className="space-y-3 bg-muted/40 p-3 rounded-lg border border-border/40 mt-1 animate-fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="splitCash" className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cash Portion</Label>
                      <Input
                        id="splitCash"
                        type="number"
                        placeholder="0.00"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="splitElectronic" className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Card/UPI Portion</Label>
                      <Input
                        id="splitElectronic"
                        type="number"
                        placeholder="0.00"
                        value={splitElectronic}
                        onChange={(e) => setSplitElectronic(e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    </div>
                  </div>
                  
                  {/* Split matching warning */}
                  <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-border/30">
                    <span className="text-muted-foreground">Sum:</span>
                    <span className={`font-mono font-bold ${splitCashCents + splitElectronicCents === totalCents ? "text-emerald-500" : "text-amber-500"}`}>
                      {((splitCashCents + splitElectronicCents) / 100).toFixed(2)} / {(totalCents / 100).toFixed(2)}
                    </span>
                  </div>
                  {splitCashCents + splitElectronicCents !== totalCents && (
                    <p className="text-[8px] text-amber-500 font-semibold text-center leading-none">
                      Split sums must equal Total Due
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={() => checkoutMutation.mutate()}
                disabled={(!canCheckout && !isLocked) || checkoutMutation.isPending || isLocked}
                className="w-full flex items-center justify-center gap-2 h-10 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground mt-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {checkoutMutation.isPending
                  ? "Processing..."
                  : viewingReceiptId !== null
                  ? isEditingPastReceipt
                    ? "Update Receipt"
                    : "Read-Only Mode"
                  : "Complete Checkout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* POS Checkout Receipt Dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className={receiptWidth === "58mm" ? "max-w-[280px] bg-card border-border select-none font-mono" : "max-w-[360px] bg-card border-border select-none font-mono"}>
          {(() => {
            const currentReceipt = receiptDetails
              ? (receiptDetails.isSplit
                  ? receiptDetails.receipts[activeReceiptTab]
                  : receiptDetails.receipts
                    ? receiptDetails.receipts[0]
                    : receiptDetails)
              : null;

            return (
              <>
                <div className="flex flex-col items-center justify-center py-4 border-b border-dashed border-border/80">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2.5" />
                  <h3 className="text-sm font-bold text-foreground">Sale Saved Successfully</h3>
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    Receipt: {currentReceipt?.receiptId}
                  </span>
                </div>

                {/* Tab Selector for Split Receipts */}
                {receiptDetails?.isSplit && (
                  <div className="flex gap-1.5 border-b border-dashed border-border/80 pb-2.5 pt-2">
                    {receiptDetails.receipts.map((rec: any, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveReceiptTab(idx)}
                        className={`flex-1 py-1.5 text-center text-[9px] font-bold uppercase rounded transition-colors ${
                          activeReceiptTab === idx
                            ? "bg-primary text-primary-foreground font-black"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/60 border border-border/40"
                        }`}
                      >
                        {rec.billType === "GST" ? "GST Invoice" : "Estimate"}
                      </button>
                    ))}
                  </div>
                )}

                {/* Receipt Mock Structure */}
                {currentReceipt && (
                  <div className="py-4 space-y-4 text-xs font-mono">
                    <div className="text-center flex flex-col items-center gap-0.5">
                      <span className="font-bold text-xs uppercase tracking-tight">
                        {currentReceipt.billType === "GST" ? "TAX INVOICE" : "ESTIMATE BILL"}
                      </span>
                      <span className="font-semibold text-[10px] uppercase tracking-tight text-foreground">{receiptHeader}</span>
                      <span className="text-[10px] text-muted-foreground">{receiptSubtitle}</span>
                      {currentReceipt.billType === "GST" && currentReceipt.storeGstin && (
                        <span className="text-[9px] text-foreground font-semibold mt-0.5">
                          GSTIN: {currentReceipt.storeGstin}
                        </span>
                      )}
                      {receiptShowDate === "true" && (
                        <span className="text-[9px] text-muted-foreground mt-1">
                          Date: {new Date(currentReceipt.timestamp).toLocaleString()}
                        </span>
                      )}
                      {currentReceipt.customerName && currentReceipt.customerName !== "General Customer" && (
                        <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                          Customer: {currentReceipt.customerName}
                        </span>
                      )}
                    </div>

                    <div className="border-t border-b border-dashed border-border/80 py-2 space-y-1.5">
                      {currentReceipt.items.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-[10px]">
                          <div className="flex flex-col">
                            <span className="text-foreground">
                              {item.product.name} {currentReceipt.billType === "GST" && item.product.gstRate ? `(GST ${item.product.gstRate}%)` : ""}
                            </span>
                            <span className="text-muted-foreground">
                              {formatQty(item.qty)} {item.product.unit || "PCs"} x {formatPrice(item.product.priceCents)}
                            </span>
                          </div>
                          <span className="text-foreground">
                            {formatPrice(item.product.priceCents * item.qty)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1 text-right">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="text-foreground">{formatPrice(currentReceipt.subtotalCents + currentReceipt.discountCents)}</span>
                      </div>
                      {currentReceipt.discountCents > 0 && (
                        <div className="flex justify-between text-rose-500">
                          <span>Discount:</span>
                          <span>-{formatPrice(currentReceipt.discountCents)}</span>
                        </div>
                      )}
                      <div className="flex justify-between w-full">
                        <span className="text-muted-foreground">
                          {currentReceipt.billType === "GST" ? "GST Tax:" : "Sales Tax:"}
                        </span>
                        <span className="text-foreground">{formatPrice(currentReceipt.taxCents)}</span>
                      </div>
                      <div className="flex justify-between w-full font-bold border-t border-dashed border-border/80 pt-1.5 text-xs">
                        <span>TOTAL:</span>
                        <span>{formatPrice(currentReceipt.totalCents)}</span>
                      </div>
                    </div>

                    {/* Payment Details */}
                    <div className="bg-muted/40 p-2.5 rounded border border-border/50 text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment Type:</span>
                        <span className="font-bold uppercase text-foreground">{currentReceipt.paymentMethod}</span>
                      </div>
                      {currentReceipt.paymentMethod === "cash" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash Given:</span>
                            <span className="text-foreground">{formatPrice(currentReceipt.cashReceivedCents)}</span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span className="text-muted-foreground">Change Returned:</span>
                            <span className="text-emerald-500">{formatPrice(currentReceipt.changeDueCents)}</span>
                          </div>
                        </>
                      )}
                      {currentReceipt.paymentMethod === "split" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Split Cash:</span>
                            <span className="text-foreground">{formatPrice(currentReceipt.splitCashCents)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Split Card/UPI:</span>
                            <span className="text-foreground">{formatPrice(currentReceipt.splitElectronicCents)}</span>
                          </div>
                        </>
                      )}
                      {receiptShowRemarks === "true" && remarks && (
                        <div className="flex justify-between border-t border-dashed border-border/40 pt-1 text-[10px] text-muted-foreground italic">
                          <span>Remarks:</span>
                          <span className="text-foreground truncate max-w-[120px]">{remarks}</span>
                        </div>
                      )}
                    </div>

                    {/* Custom Footer Notes */}
                    <div className="text-center text-[10px] text-muted-foreground uppercase font-bold border-t border-dashed border-border/80 pt-2.5 mt-2">
                      {receiptFooter}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-dashed border-border/80">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8.5 animate-pulse bg-primary text-primary-foreground font-bold hover:bg-primary/95 border-none"
                    onClick={() => {
                      if (currentReceipt) {
                        toast.loading("Printing Receipt...", {
                          id: "pos-receipt-print-toast",
                          description: `Sending print job for "${currentReceipt.receiptId}"...`,
                        });
                        setPrintStatus("spooling");
                        setPrintProgress(15);
                        const t1 = setTimeout(() => setPrintProgress(45), 150);
                        const t2 = setTimeout(() => setPrintProgress(75), 400);
 
                        printPOSReceipt(
                          {
                            receiptId: currentReceipt.receiptId,
                            timestamp: currentReceipt.timestamp,
                            customerName: currentReceipt.customerName,
                            items: currentReceipt.items,
                            subtotalCents: currentReceipt.subtotalCents,
                            discountCents: currentReceipt.discountCents,
                            taxCents: currentReceipt.taxCents,
                            totalCents: currentReceipt.totalCents,
                            paymentMethod: currentReceipt.paymentMethod,
                            cashReceivedCents: currentReceipt.cashReceivedCents,
                            changeDueCents: currentReceipt.changeDueCents,
                            splitCashCents: currentReceipt.splitCashCents,
                            splitElectronicCents: currentReceipt.splitElectronicCents,
                            remarksText: remarks || undefined,
                            billType: currentReceipt.billType,
                            gstin: currentReceipt.storeGstin,
                          },
                          {
                            header: receiptHeader,
                            subtitle: receiptSubtitle,
                            width: receiptWidth as "80mm" | "58mm",
                            showDate: receiptShowDate === "true",
                            showRemarks: receiptShowRemarks === "true",
                            footer: receiptFooter,
                            defaultPrinter: dbSettings.find((s) => s.key === "receipt_default_printer")?.value || "",
                            printMode: dbSettings.find((s) => s.key === "receipt_print_mode")?.value || "html",
                            currency: currency,
                          }
                        )
                          .then(() => {
                            clearTimeout(t1);
                            clearTimeout(t2);
                            setPrintProgress(100);
                            setPrintStatus("success");
                            setTimeout(() => setPrintStatus(null), 1000);
                            toast.success("Receipt Printed", {
                              id: "pos-receipt-print-toast",
                              description: `Successfully printed receipt "${currentReceipt.receiptId}".`,
                            });
                          })
                          .catch((err) => {
                            clearTimeout(t1);
                            clearTimeout(t2);
                            setPrintStatus("error");
                            setTimeout(() => setPrintStatus(null), 2000);
                            console.error(err);
                            toast.error("Printing Failed", {
                              id: "pos-receipt-print-toast",
                              description: err.message || "Could not print POS receipt.",
                            });
                          });
                      }
                    }}
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Receipt
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-8.5"
                    onClick={() => setReceiptOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Past Sales History Dialog */}
      <Dialog open={pastSalesOpen} onOpenChange={setPastSalesOpen}>
        <DialogContent className="max-w-[90vw] w-[800px] bg-card border-border select-none max-h-[85vh] overflow-y-auto text-xs">
          <DialogHeader className="border-b border-border/80 pb-2.5">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <History className="w-4.5 h-4.5 text-primary" />
              Past Sales Receipts History
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3.5">
            <div className="max-w-md">
              <Input
                type="text"
                placeholder="Search receipts by Receipt No or Customer..."
                value={pastSalesSearch}
                onChange={(e) => setPastSalesSearch(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>

            <div className="border border-border rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/80 text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-semibold">
                    <th className="py-2 px-3">Receipt ID</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Godown</th>
                    <th className="py-2 px-3">Payment</th>
                    <th className="py-2 px-3 text-right">Grand Total</th>
                    <th className="py-2 px-3 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {pastSales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        No past sales receipts found.
                      </td>
                    </tr>
                  ) : (
                    pastSales.map((sale) => (
                      <tr key={sale.receiptId} className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">
                        <td className="py-2 px-3 font-mono font-semibold text-foreground">#{sale.receiptId}</td>
                        <td className="py-2 px-3 text-muted-foreground font-mono">{new Date(sale.timestamp).toLocaleString()}</td>
                        <td className="py-2 px-3 font-semibold">{sale.customerName}</td>
                        <td className="py-2 px-3 text-muted-foreground">{sale.godownName}</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase font-mono">
                            {sale.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                          {formatPrice(sale.totalCents)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              // Load past sale directly into main POS Cart & fields!
                              setViewingReceiptId(sale.receiptId);
                              setIsEditingPastReceipt(false);
                              setBillingMode(sale.billType === "GST" ? "gst" : "estimate");

                              // Load cart items
                              const cartItems = sale.items.map((it: any) => ({
                                product: it.product,
                                qty: it.qty,
                              }));
                              setCart(cartItems);

                              // Load customer/logistics details
                              setCustomerName(sale.customerName);
                              setGodown(sale.godownName);
                              setVehicleNo(sale.vehicleNum);
                              setRemarks(sale.remarksText);

                              // Load discounts & payments
                              setDiscountVal(sale.discountVal);
                              setDiscountType(sale.discountType);
                              setPaymentMethod(sale.paymentMethod);
                              setCashReceived(sale.cashReceived);
                              setSplitCash(sale.splitCash);
                              setSplitElectronic(sale.splitElectronic);

                              setPastSalesOpen(false); // Close past sales dialog
                            }}
                            className="w-7 h-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
                            title="Load & View Sale"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Camera Barcode Scanner Dialog */}
      <Dialog open={cameraOpen} onOpenChange={(open) => {
        setCameraOpen(open);
        if (!open) stopCamera();
      }}>
        <DialogContent className="sm:max-w-sm bg-card border-border select-none">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-primary" />
              Camera Barcode Scanner
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="text-center text-[10px] text-muted-foreground max-w-xs leading-normal">
              Align the barcode or QR code inside the targeting scanner zone below to scan and automatically add it to the checkout list.
            </div>

            {cameraDevices.length > 1 && (
              <div className="w-full space-y-1 px-2">
                <label className="text-[9px] font-bold text-muted-foreground uppercase">Camera Source</label>
                <select
                  value={selectedCameraId}
                  onChange={async (e) => {
                    const nextId = e.target.value;
                    setSelectedCameraId(nextId);
                    await stopCamera();
                    startCamera(nextId);
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:ring-1 focus:ring-primary text-foreground"
                >
                  {cameraDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label || `Camera ${device.id.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Scanning viewport Target */}
            <div className="relative border border-border rounded-lg overflow-hidden bg-black w-[280px] h-[200px] flex items-center justify-center shadow-[inset_0_0_60px_rgba(0,0,0,0.85)]">
              <div id="reader" className="w-full h-full [&_video]:object-cover"></div>
              
              {/* Dark Overlay Mask Cutout */}
              <div className="absolute inset-0 pointer-events-none bg-black/35 flex items-center justify-center">
                <div className="w-[220px] h-[120px] border border-emerald-500/25 rounded-lg bg-emerald-500/[0.01] shadow-[0_0_15px_rgba(16,185,129,0.02)] relative">
                  
                  {/* Laser line slider */}
                  <div 
                    className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#10b981]"
                    style={{
                      animation: "desktopScan 2s linear infinite",
                    }}
                  />

                  {/* Target corner brackets */}
                  <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400 rounded-tl"></div>
                  <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400 rounded-tr"></div>
                  <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400 rounded-bl"></div>
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400 rounded-br"></div>
                </div>
              </div>

              {/* Embedded keyframe styles */}
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes desktopScan {
                  0% { top: 0px; opacity: 0; }
                  10% { opacity: 1; }
                  90% { opacity: 1; }
                  100% { top: 118px; opacity: 0; }
                }
              `}} />
            </div>

            <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>Camera active and searching...</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/80 pt-3.5 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={async () => {
                await stopCamera();
                setCameraOpen(false);
              }}
            >
              Cancel Scanning
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Setup Wizard Dialog */}
      <Dialog open={mobileSetupOpen} onOpenChange={setMobileSetupOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border select-none">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              Link Phone Scanner
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4 text-xs text-foreground">
            {connectedDevice ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="font-bold text-emerald-500 text-xs">Device Connected</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  IP: {connectedDevice}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await disconnectDevice(connectedDevice);
                    setConnectedDevice(null);
                  }}
                  className="h-8 mt-2 text-xs font-semibold text-rose-500 border-rose-500/20 hover:bg-rose-500/10"
                >
                  Disconnect Device
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="font-bold uppercase text-[9px] text-muted-foreground tracking-wider block">Step 1: Connect USB & Turn on Tethering</span>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Connect your phone to your PC via USB, go to your phone's USB Settings, and enable <strong>USB tethering</strong> (or ensure both devices are on the same local WiFi network).
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="font-bold uppercase text-[9px] text-muted-foreground tracking-wider block">Step 2: Select Adapter & Scan QR</span>
                  {(() => {
                    const ips = localIp.split(",").map(ip => ip.trim()).filter(Boolean);
                    const activeIp = ips[activeIpIndex] || ips[0] || "192.168.137.1";
                    
                    return (
                      <>
                        {ips.length > 1 && (
                          <div className="flex flex-col gap-1 p-1.5 bg-muted/60 rounded-xl border border-border/40 mb-2">
                            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest px-1">Network Adaptors Found:</span>
                            <div className="flex flex-col gap-1">
                              {ips.map((ip, idx) => {
                                const isTether = ip.startsWith("192.168.137") || ip.startsWith("192.168.42") || ip.startsWith("172.20.10");
                                const label = isTether ? "USB Tethering / Hotspot" : `Local WiFi / Network`;
                                return (
                                  <button
                                    key={ip}
                                    type="button"
                                    onClick={() => setActiveIpIndex(idx)}
                                    className={`flex items-center justify-between text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all ${
                                      activeIpIndex === idx 
                                        ? "bg-primary text-primary-foreground shadow" 
                                        : "text-foreground/80 hover:text-foreground bg-card hover:bg-muted border border-border/50"
                                    }`}
                                  >
                                    <span>{label}</span>
                                    <span className="font-mono text-[9px] opacity-80">{ip}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground leading-normal">
                          Open your phone browser and navigate to:
                        </p>
                        <div className="bg-muted p-2.5 rounded border border-border/80 font-mono text-[10px] select-all break-all text-center">
                          http://{activeIp}:3030?pin={pairingPin}
                        </div>
                        <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-border/80 w-[140px] h-[140px] mx-auto mt-2.5 shadow-sm">
                          <QRCodeSVG 
                            value={`http://${activeIp}:3030?pin=${pairingPin}`}
                            size={120}
                            level="M"
                            includeMargin={false}
                          />
                        </div>

                        <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 text-[10px] text-amber-500/90 leading-normal mt-3">
                          <span className="font-bold block mb-1">⚠️ Camera Access Denied?</span>
                          Modern phone browsers restrict camera usage to secure origins (HTTPS). To allow camera access on local HTTP network URLs:
                          <ol className="list-decimal pl-4 mt-1.5 space-y-1">
                            <li>On your phone Chrome browser, navigate to <code className="bg-background px-1 py-0.5 rounded font-mono text-[9px]">chrome://flags</code>.</li>
                            <li>Search for <code className="bg-background px-1 py-0.5 rounded font-mono text-[9px]">unsafely-treat-insecure-origin-as-secure</code>.</li>
                            <li>Add your connection URL <code className="bg-background px-1 py-0.5 rounded font-mono text-[9px]">http://{activeIp}:3030</code>, set it to <strong>Enabled</strong>, and tap Relaunch.</li>
                          </ol>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="bg-muted/40 p-4 rounded-xl border border-border/50 text-center space-y-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Pairing PIN</span>
                  <div className="text-2xl font-bold font-mono tracking-widest text-primary">
                    {pairingPin}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/80 pt-3.5 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => setMobileSetupOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connection Approval Dialog */}
      <Dialog open={pendingRequest !== null} onOpenChange={() => setPendingRequest(null)}>
        <DialogContent className="max-w-xs bg-card border-border select-none text-center p-6">
          <QrCode className="w-12 h-12 text-primary mx-auto mb-3 animate-bounce" />
          <h3 className="text-sm font-bold text-foreground">Mobile Scanner Request</h3>
          <p className="text-[10px] text-muted-foreground mt-2 leading-normal">
            A mobile device at <strong className="font-mono text-foreground">{pendingRequest?.ip}</strong> is attempting to pair using PIN <strong className="font-mono text-primary text-xs">{pendingRequest?.pin}</strong>.
          </p>
          <div className="flex gap-2 mt-4 pt-3 border-t border-border/80">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs font-semibold text-rose-500 border-rose-500/20 hover:bg-rose-500/10"
              onClick={async () => {
                if (pendingRequest) {
                  await approveDevice(pendingRequest.ip, false, "[]");
                  setPendingRequest(null);
                }
              }}
            >
              Deny
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={async () => {
                if (pendingRequest) {
                  await approveDevice(pendingRequest.ip, true, JSON.stringify(products));
                  setConnectedDevice(pendingRequest.ip);
                  setPendingRequest(null);
                }
              }}
            >
              Allow
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop Scan Confirmation Dialog */}
      <Dialog open={scanConfirmProduct !== null} onOpenChange={() => {
        if (scanConfirmProduct) {
          if ((window as any).html5QrCodeInstance) {
            (window as any).html5QrCodeInstance.resume();
          }
          setScanConfirmProduct(null);
        }
      }}>
        <DialogContent className="max-w-xs bg-card border-border select-none text-center p-6">
          <ScanBarcode className="w-10 h-10 text-primary mx-auto mb-2" />
          <h3 className="text-sm font-bold text-foreground">Confirm Scanned Item</h3>
          
          <div className="bg-muted/40 p-3 rounded-lg border border-border/50 text-left space-y-1.5 my-3 relative overflow-hidden">
            {scanConfirmProduct?.imageUrl && (
              <div className="flex justify-center mb-2">
                <img 
                  src={scanConfirmProduct.imageUrl} 
                  alt={scanConfirmProduct.name}
                  className="w-16 h-16 object-cover rounded-md border border-border bg-white"
                />
              </div>
            )}
            <div className="text-[11px] font-bold text-foreground">{scanConfirmProduct?.name}</div>
            <div className="text-[9px] text-muted-foreground font-mono">SKU: {scanConfirmProduct?.sku}</div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-500 font-mono">
                {scanConfirmProduct ? formatPrice(scanConfirmProduct.priceCents) : formatPrice(0)}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-sans text-[9px] font-bold uppercase tracking-wider ${
                scanConfirmProduct && getProductStock(scanConfirmProduct.id) > 0 
                  ? getProductStock(scanConfirmProduct.id) < 25 
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" 
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              }`}>
                {scanConfirmProduct 
                  ? getProductStock(scanConfirmProduct.id) > 0 
                    ? `${getProductStock(scanConfirmProduct.id)} Stock` 
                    : "Out of Stock" 
                  : "0 Stock"
                }
              </span>
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between my-3.5 px-1">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Quantity:</span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="w-7 h-7 rounded border-border/80 text-foreground"
                onClick={() => setScanConfirmQty(Math.max(1, scanConfirmQty - 1))}
                disabled={!scanConfirmProduct || getProductStock(scanConfirmProduct.id) <= 0}
              >
                -
              </Button>
              <Input
                type="number"
                step={scanConfirmProduct && isDecimalUnit(scanConfirmProduct.unit) ? "0.01" : "1"}
                value={scanConfirmQty}
                onChange={async (e) => {
                  const parsed = scanConfirmProduct && isDecimalUnit(scanConfirmProduct.unit)
                    ? parseFloat(e.target.value)
                    : parseInt(e.target.value);
                  if (isNaN(parsed) || parsed < 0.001) {
                    setScanConfirmQty(1);
                  } else if (scanConfirmProduct) {
                    const stock = getProductStock(scanConfirmProduct.id);
                    if (parsed > stock) {
                      await showAlert(`Only ${stock} units available in stock.`, "Out of Stock", "warning");
                      setScanConfirmQty(stock > 0 ? stock : 1);
                    } else {
                      setScanConfirmQty(parsed);
                    }
                  } else {
                    setScanConfirmQty(parsed);
                  }
                }}
                disabled={!scanConfirmProduct || getProductStock(scanConfirmProduct.id) <= 0}
                className="w-12 h-7 text-center font-mono font-bold text-xs p-0 border-border/80 text-foreground bg-background"
              />
              <Button
                variant="outline"
                size="icon"
                className="w-7 h-7 rounded border-border/80 text-foreground"
                onClick={async () => {
                  if (scanConfirmProduct) {
                    const stock = getProductStock(scanConfirmProduct.id);
                    if (scanConfirmQty + 1 > stock) {
                      await showAlert(`Cannot exceed available stock of ${stock} units.`, "Out of Stock", "warning");
                      return;
                    }
                  }
                  setScanConfirmQty(scanConfirmQty + 1);
                }}
                disabled={!scanConfirmProduct || getProductStock(scanConfirmProduct.id) <= 0}
              >
                +
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-border/80">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs font-semibold text-muted-foreground"
              onClick={() => {
                if ((window as any).html5QrCodeInstance) {
                  (window as any).html5QrCodeInstance.resume();
                }
                setScanConfirmProduct(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 h-8 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={!scanConfirmProduct || getProductStock(scanConfirmProduct.id) <= 0}
              onClick={() => {
                if (scanConfirmProduct) {
                  addToCart(scanConfirmProduct, scanConfirmQty);
                  if ((window as any).html5QrCodeInstance) {
                    (window as any).html5QrCodeInstance.resume();
                  }
                  setScanConfirmProduct(null);
                }
              }}
            >
              {scanConfirmProduct && getProductStock(scanConfirmProduct.id) <= 0 ? "Out of Stock" : "Add to Cart"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
    </>
  );
}

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

function PaginationControls({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between py-2 px-1 border-t border-border/40 text-[11px] text-muted-foreground select-none">
      <div>
        Showing <span className="font-semibold text-foreground">{Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(totalItems, currentPage * itemsPerPage)}</span> of <span className="font-semibold text-foreground">{totalItems}</span> records
      </div>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-7 px-2.5 text-[10px]"
        >
          Previous
        </Button>
        <div className="flex items-center px-2 font-mono text-[10px]">
          Page {currentPage} of {totalPages}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-7 px-2.5 text-[10px]"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

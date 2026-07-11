"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Product, CreateProductInput } from "@/types/storeos";
import { createProduct, updateProduct, getSettings } from "@/lib/ipc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/layout/app-layout";
import { Image as ImageIcon } from "lucide-react";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  cost: z.number().min(0, "Cost must be positive"),
  category: z.string().optional(),
  brand: z.string().optional(),
  imageUrl: z.string().optional(),
  gstRate: z.number().min(0).max(100).optional(),
  unit: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductDialogProps {
  product: Product | null; // Null if creating
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductDialog({ product, open, onOpenChange }: ProductDialogProps) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const isEditing = !!product;

  const role = session?.role || "Admin";
  const isCashier = role === "Cashier";
  const isAuditor = role === "Auditor";
  const disablePriceEdit = isCashier || isAuditor;
  const disableAllEdit = isAuditor;

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const currency = dbSettings.find((s) => s.key === "currency")?.value || "USD";
  const idFormat = dbSettings.find((s) => s.key === "product_id_format")?.value || "sku_barcode";
  const isSerialMode = idFormat === "sku_serial";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      description: "",
      price: 0,
      cost: 0,
      category: "",
      brand: "",
      imageUrl: "",
      gstRate: 0,
      unit: "PCs",
    },
  });

  const currentImageUrl = watch("imageUrl");

  // Pre-fill form if editing
  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode || "",
        description: product.description || "",
        price: product.priceCents / 100,
        cost: product.costCents / 100,
        category: product.category || "",
        brand: product.brand || "",
        imageUrl: product.imageUrl || "",
        gstRate: product.gstRate || 0,
        unit: product.unit || "PCs",
      });
    } else {
      reset({
        name: "",
        sku: "",
        barcode: "",
        description: "",
        price: 0,
        cost: 0,
        category: "",
        brand: "",
        imageUrl: "",
        gstRate: 0,
        unit: "PCs",
      });
    }
  }, [product, reset, open]);

  const mutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const input: CreateProductInput = {
        name: values.name,
        sku: values.sku,
        barcode: values.barcode || undefined,
        description: values.description || undefined,
        priceCents: Math.round(values.price * 100),
        costCents: Math.round(values.cost * 100),
        category: values.category || undefined,
        brand: values.brand || undefined,
        imageUrl: values.imageUrl || undefined,
        gstRate: values.gstRate,
        unit: values.unit || "PCs",
      };

      if (isEditing && product) {
        return updateProduct(product.id, input);
      } else {
        return createProduct(input);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      onOpenChange(false);
    },
  });

  const onSubmit = (data: ProductFormValues) => {
    if (disableAllEdit) return;
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {disableAllEdit ? "View Product Details" : isEditing ? "Edit Product Details" : "Register New Product"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Optional Product Image Preview Card */}
          <div className="flex gap-4 items-center bg-muted/20 p-3 rounded-lg border border-border/50">
            <div className="w-16 h-16 rounded-md bg-muted border border-border/80 flex items-center justify-center overflow-hidden flex-shrink-0">
              {currentImageUrl ? (
                <img src={currentImageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }} />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground/60" />
              )}
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor="imageUrl" className="text-xs font-semibold text-foreground">Product Image URL (Optional)</Label>
              <Input
                id="imageUrl"
                {...register("imageUrl")}
                disabled={disableAllEdit}
                className="h-8 text-xs font-mono"
                placeholder="https://example.com/product.jpg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-semibold text-foreground">Product Name</Label>
            <Input id="name" {...register("name")} disabled={disableAllEdit} className="h-9 text-xs" placeholder="e.g. Cast Iron Skillet 12-inch" />
            {errors.name && <p className="text-[10px] text-rose-500 font-semibold">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku" className="text-xs font-semibold text-foreground">SKU Code</Label>
              <Input id="sku" {...register("sku")} disabled={disableAllEdit} className="h-9 text-xs font-mono" placeholder="HK-CIS-12" />
              {errors.sku && <p className="text-[10px] text-rose-500 font-semibold">{errors.sku.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode" className="text-xs font-semibold text-foreground">
                {isSerialMode ? "Serial Number" : "Barcode (UPC)"}
              </Label>
              <Input
                id="barcode"
                {...register("barcode")}
                disabled={disableAllEdit}
                className="h-9 text-xs font-mono"
                placeholder={isSerialMode ? "e.g. SN-82910" : "e.g. 071981200124"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price" className="text-xs font-semibold text-foreground">Retail Price ({currency})</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                {...register("price", { valueAsNumber: true })}
                disabled={disablePriceEdit}
                className="h-9 text-xs font-mono"
              />
              {errors.price && <p className="text-[10px] text-rose-500 font-semibold">{errors.price.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost" className="text-xs font-semibold text-foreground">Unit Cost ({currency})</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                {...register("cost", { valueAsNumber: true })}
                disabled={disablePriceEdit}
                className="h-9 text-xs font-mono"
              />
              {errors.cost && <p className="text-[10px] text-rose-500 font-semibold">{errors.cost.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gstRate" className="text-xs font-semibold text-foreground">GST Rate (%)</Label>
              <select
                id="gstRate"
                {...register("gstRate", { valueAsNumber: true })}
                disabled={disableAllEdit}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value={0}>0% (Nil)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit" className="text-xs font-semibold text-foreground">Unit</Label>
              <select
                id="unit"
                {...register("unit")}
                disabled={disableAllEdit}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              >
                <option value="PCs">PCs (Pieces)</option>
                <option value="Kgs">Kgs (Kilograms)</option>
                <option value="Ltrs">Ltrs (Liters)</option>
                <option value="Box">Box</option>
                <option value="Mtrs">Mtrs (Meters)</option>
                <option value="Pkts">Pkts (Packets)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-xs font-semibold text-foreground">Category</Label>
              <Input id="category" {...register("category")} disabled={disableAllEdit} className="h-9 text-xs" placeholder="Cookware" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand" className="text-xs font-semibold text-foreground">Brand Name</Label>
              <Input id="brand" {...register("brand")} disabled={disableAllEdit} className="h-9 text-xs" placeholder="e.g. Lodge" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs font-semibold text-foreground">Description</Label>
              <Input id="description" {...register("description")} disabled={disableAllEdit} className="h-9 text-xs" placeholder="Short item description" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8.5 text-xs">
              {disableAllEdit ? "Close" : "Cancel"}
            </Button>
            {!disableAllEdit && (
              <Button type="submit" size="sm" className="h-8.5 text-xs" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : isEditing ? "Save Changes" : "Register SKU"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

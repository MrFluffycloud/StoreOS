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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getProducts, addInventoryMovement } from "@/lib/ipc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const adjustmentSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  direction: z.enum(["add", "remove"]),
  movementType: z.enum(["Purchase", "Return", "Damage", "Adjustment", "Transfer", "SalesReturn", "PurchaseReturn"]),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  referenceId: z.string().optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustmentDialog({ open, onOpenChange }: AdjustmentDialogProps) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      productId: "",
      direction: "add",
      movementType: "Adjustment",
      quantity: 1,
      referenceId: "",
    },
  });

  const direction = watch("direction");

  // Automatically adjust default movementType based on direction
  useEffect(() => {
    if (direction === "remove") {
      setValue("movementType", "Damage");
    } else {
      setValue("movementType", "Purchase");
    }
  }, [direction, setValue]);

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: async (values: AdjustmentFormValues) => {
      const isSubtraction = values.direction === "remove" || values.movementType === "Damage";
      const qty = isSubtraction ? -Math.abs(values.quantity) : Math.abs(values.quantity);

      const input = {
        productId: values.productId,
        quantity: qty,
        movementType: values.movementType,
        referenceType: "ManualAdjustment",
        referenceId: values.referenceId || undefined,
        employeeId: "system",
      };

      return addInventoryMovement(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventorySummary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
  });

  const onSubmit = (data: AdjustmentFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Log Stock Adjustment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Product Select */}
          <div className="space-y-2">
            <Label htmlFor="productId" className="text-xs font-semibold text-foreground">Select Product</Label>
            <select
              id="productId"
              {...register("productId")}
              className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
            >
              <option value="">-- Choose Catalog SKU --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
            {errors.productId && <p className="text-[10px] text-rose-500 font-semibold">{errors.productId.message}</p>}
          </div>

          {/* Direction (Add/Remove) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Adjustment Direction</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={direction === "add" ? "default" : "outline"}
                  onClick={() => setValue("direction", "add")}
                  className="flex-1 h-8 text-xs font-medium"
                >
                  Add Stock
                </Button>
                <Button
                  type="button"
                  variant={direction === "remove" ? "default" : "outline"}
                  onClick={() => setValue("direction", "remove")}
                  className="flex-1 h-8 text-xs font-medium"
                >
                  Remove Stock
                </Button>
              </div>
            </div>

            {/* Movement Type */}
            <div className="space-y-2">
              <Label htmlFor="movementType" className="text-xs font-semibold text-foreground">Movement Type</Label>
              <select
                id="movementType"
                {...register("movementType")}
                className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
              >
                {direction === "add" ? (
                  <>
                    <option value="Purchase">Purchase (Restock)</option>
                    <option value="SalesReturn">Sales Return (Customer Restock)</option>
                    <option value="Adjustment">Adjustment (Add)</option>
                  </>
                ) : (
                  <>
                    <option value="Damage">Damage Write-off</option>
                    <option value="PurchaseReturn">Purchase Return (Supplier Return)</option>
                    <option value="Transfer">Transfer Out</option>
                    <option value="Adjustment">Adjustment (Subtract)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-xs font-semibold text-foreground">Quantity Units</Label>
              <Input id="quantity" type="number" min="1" {...register("quantity", { valueAsNumber: true })} className="h-9 text-xs font-mono" />
              {errors.quantity && <p className="text-[10px] text-rose-500 font-semibold">{errors.quantity.message}</p>}
            </div>

            {/* Reference ID */}
            <div className="space-y-2">
              <Label htmlFor="referenceId" className="text-xs font-semibold text-foreground">Reference / Memo</Label>
              <Input id="referenceId" {...register("referenceId")} className="h-9 text-xs font-mono" placeholder="e.g. PO-009" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8.5 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8.5 text-xs" disabled={mutation.isPending}>
              {mutation.isPending ? "Logging..." : "Log Stock Movement"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

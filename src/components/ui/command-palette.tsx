"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  History,
  Settings,
  Plus,
  ShoppingBag,
  RotateCcw,
} from "lucide-react";
import { useAuth, hasPermission } from "../layout/app-layout";

interface CommandPaletteProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function CommandPalette({ open, setOpen }: CommandPaletteProps) {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.role || "Admin";

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {hasPermission(role, "/dashboard") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
          )}
          {hasPermission(role, "/sales") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/sales"))}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              <span>Sales (POS)</span>
            </CommandItem>
          )}
          {hasPermission(role, "/products") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/products"))}>
              <Package className="mr-2 h-4 w-4" />
              <span>Products</span>
            </CommandItem>
          )}
          {hasPermission(role, "/purchases") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/purchases"))}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              <span>Purchases</span>
            </CommandItem>
          )}
          {hasPermission(role, "/returns") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/returns"))}>
              <RotateCcw className="mr-2 h-4 w-4" />
              <span>Returns</span>
            </CommandItem>
          )}
          {hasPermission(role, "/inventory") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/inventory"))}>
              <History className="mr-2 h-4 w-4" />
              <span>Inventory Movements</span>
            </CommandItem>
          )}
          {hasPermission(role, "/settings") && (
            <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        
        {/* Render quick actions only if user has access to that page */}
        {(hasPermission(role, "/sales") || hasPermission(role, "/products")) && (
          <CommandGroup heading="Quick Actions">
            {hasPermission(role, "/sales") && (
              <CommandItem onSelect={() => runCommand(() => router.push("/sales"))}>
                <Plus className="mr-2 h-4 w-4" />
                <span>New Sale</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  Ctrl+N
                </kbd>
              </CommandItem>
            )}
            {hasPermission(role, "/products") && (
              <CommandItem onSelect={() => runCommand(() => router.push("/products?action=new"))}>
                <Plus className="mr-2 h-4 w-4" />
                <span>New Product</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  Ctrl+P
                </kbd>
              </CommandItem>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

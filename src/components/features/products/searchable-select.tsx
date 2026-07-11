"use client";

import { useState, useRef, useEffect } from "react";
import { Product } from "@/types/storeos";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface SearchableProductSelectProps {
  products: Product[];
  selectedProductId: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

export function SearchableProductSelect({
  products,
  selectedProductId,
  onChange,
  placeholder = "Search product by name or SKU...",
}: SearchableProductSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync display search input value with selected product
  useEffect(() => {
    if (selectedProduct) {
      setSearchQuery(`${selectedProduct.name} (${selectedProduct.sku})`);
    } else {
      setSearchQuery("");
    }
  }, [selectedProductId, selectedProduct]);

  const filtered = searchQuery
    ? products
        .filter((p) => {
          // If we matched the exact selected string, show all options on focus,
          // otherwise filter by query
          if (selectedProduct && searchQuery === `${selectedProduct.name} (${selectedProduct.sku})`) {
            return true;
          }
          const s = searchQuery.toLowerCase();
          return p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
        })
        .slice(0, 10)
    : products.slice(0, 10);

  return (
    <div ref={containerRef} className="relative w-full text-xs">
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange("");
            }
          }}
          onFocus={() => setIsOpen(true)}
          className="h-8 pr-7 bg-background border-border/80 text-xs w-full font-medium"
        />
        <Search className="absolute right-2 top-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-56 overflow-y-auto select-none font-sans">
          {filtered.length === 0 ? (
            <div className="py-2 px-3 text-[11px] text-muted-foreground text-center">
              No matching products
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setSearchQuery(`${p.name} (${p.sku})`);
                  setIsOpen(false);
                }}
                className={`w-full text-left py-1.5 px-3 hover:bg-muted text-[11px] border-b border-border/20 last:border-0 flex items-center gap-2.5 transition-colors ${
                  p.id === selectedProductId ? "bg-muted font-semibold" : ""
                }`}
              >
                <div className="w-7 h-7 rounded border border-border flex items-center justify-center overflow-hidden bg-muted flex-shrink-0">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{p.name.slice(0, 2)}</span>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-foreground truncate font-medium">{p.name}</span>
                  <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
                    SKU: {p.sku} | Price: ${(p.priceCents / 100).toFixed(2)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

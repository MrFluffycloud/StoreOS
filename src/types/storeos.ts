export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  priceCents: number;
  costCents: number;
  category?: string;
  brand?: string;
  imageUrl?: string;
  gstRate?: number;
  unit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  priceCents: number;
  costCents: number;
  category?: string;
  brand?: string;
  imageUrl?: string;
  gstRate?: number;
  unit?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  quantity: number;
  movementType: 'Purchase' | 'Sale' | 'Return' | 'Damage' | 'Adjustment' | 'Transfer' | 'SalesReturn' | 'PurchaseReturn';
  referenceType?: string;
  referenceId?: string;
  employeeId?: string;
  timestamp: string;
}

export interface CreateInventoryMovementInput {
  productId: string;
  quantity: number;
  movementType: 'Purchase' | 'Sale' | 'Return' | 'Damage' | 'Adjustment' | 'Transfer' | 'SalesReturn' | 'PurchaseReturn';
  referenceType?: string;
  referenceId?: string;
  employeeId?: string;
}

export interface InventorySummary {
  productId: string;
  sku: string;
  productName: string;
  currentStock: number;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface CreateSupplierInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

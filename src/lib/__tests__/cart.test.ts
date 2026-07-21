import { describe, it, expect } from "vitest";

interface CartItem {
  priceCents: number;
  qty: number;
}

function calculateCartTotal(
  items: CartItem[],
  discountVal: number,
  discountType: "flat" | "percent",
  taxRatePercent: number
) {
  const subtotalCents = items.reduce(
    (acc, item) => acc + item.priceCents * item.qty,
    0
  );

  let discountCents = 0;
  if (discountType === "flat") {
    discountCents = Math.round(discountVal * 100);
  } else {
    discountCents = Math.round(subtotalCents * (discountVal / 100));
  }
  discountCents = Math.min(discountCents, subtotalCents);

  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * (taxRatePercent / 100));
  const grandTotalCents = taxableCents + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxableCents,
    taxCents,
    grandTotalCents,
  };
}

describe("POS Cart & Checkout Calculation Tests", () => {
  const items: CartItem[] = [
    { priceCents: 1000, qty: 2 }, // $20.00
    { priceCents: 3000, qty: 1 }, // $30.00
  ]; // Subtotal = $50.00 (5000 cents)

  it("should calculate correct subtotal and tax without discounts", () => {
    const calc = calculateCartTotal(items, 0, "flat", 8.25);
    expect(calc.subtotalCents).toBe(5000);
    expect(calc.discountCents).toBe(0);
    expect(calc.taxableCents).toBe(5000);
    expect(calc.taxCents).toBe(413); // 5000 * 0.0825 = 412.5 -> 413 cents
    expect(calc.grandTotalCents).toBe(5413);
  });

  it("should apply flat dollar discounts correctly", () => {
    const calc = calculateCartTotal(items, 5, "flat", 10); // $5.00 discount (500 cents), 10% tax
    expect(calc.subtotalCents).toBe(5000);
    expect(calc.discountCents).toBe(500);
    expect(calc.taxableCents).toBe(4500);
    expect(calc.taxCents).toBe(450);
    expect(calc.grandTotalCents).toBe(4950);
  });

  it("should apply percentage discounts correctly", () => {
    const calc = calculateCartTotal(items, 20, "percent", 10); // 20% discount ($10.00), 10% tax
    expect(calc.subtotalCents).toBe(5000);
    expect(calc.discountCents).toBe(1000);
    expect(calc.taxableCents).toBe(4000);
    expect(calc.taxCents).toBe(400);
    expect(calc.grandTotalCents).toBe(4400);
  });

  it("should cap discounts to not exceed subtotal", () => {
    const calc = calculateCartTotal(items, 100, "flat", 10); // $100 discount on $50 subtotal
    expect(calc.discountCents).toBe(5000);
    expect(calc.taxableCents).toBe(0);
    expect(calc.grandTotalCents).toBe(0);
  });
});

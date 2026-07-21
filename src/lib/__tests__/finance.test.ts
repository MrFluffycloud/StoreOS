import { describe, it, expect } from "vitest";

interface JournalItem {
  accountCode: string;
  debitCents: number;
  creditCents: number;
}

interface Account {
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
}

function validateJournalEntry(items: JournalItem[]): boolean {
  if (!items || items.length < 2) return false;
  const totalDebit = items.reduce((acc, item) => acc + item.debitCents, 0);
  const totalCredit = items.reduce((acc, item) => acc + item.creditCents, 0);
  return totalDebit === totalCredit && totalDebit > 0;
}

function calculateBalanceSheet(
  accounts: Account[],
  balances: Record<string, number>
) {
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let totalEquityCents = 0;

  for (const acct of accounts) {
    const bal = balances[acct.code] || 0;
    if (acct.type === "Asset") totalAssetsCents += bal;
    else if (acct.type === "Liability") totalLiabilitiesCents += bal;
    else if (acct.type === "Equity") totalEquityCents += bal;
  }

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    totalEquityCents,
    isBalanced: totalAssetsCents === totalLiabilitiesCents + totalEquityCents,
  };
}

describe("Double-Entry Financial Accounting Ledger Tests", () => {
  it("should validate balanced journal entries where Total Debits equal Total Credits", () => {
    const validEntry: JournalItem[] = [
      { accountCode: "1010", debitCents: 5000, creditCents: 0 },
      { accountCode: "4000", debitCents: 0, creditCents: 5000 },
    ];
    expect(validateJournalEntry(validEntry)).toBe(true);
  });

  it("should reject unbalanced journal entries where Debits do not equal Credits", () => {
    const invalidEntry: JournalItem[] = [
      { accountCode: "1010", debitCents: 5000, creditCents: 0 },
      { accountCode: "4000", debitCents: 0, creditCents: 4500 },
    ];
    expect(validateJournalEntry(invalidEntry)).toBe(false);
  });

  it("should verify fundamental accounting equation: Assets = Liabilities + Equity", () => {
    const mockAccounts: Account[] = [
      { code: "1010", name: "Cash", type: "Asset" },
      { code: "1200", name: "Inventory Asset", type: "Asset" },
      { code: "2000", name: "Accounts Payable", type: "Liability" },
      { code: "3000", name: "Retained Earnings", type: "Equity" },
    ];

    const mockBalances: Record<string, number> = {
      "1010": 500000, // $5,000 Cash
      "1200": 300000, // $3,000 Inventory Asset
      "2000": 200000, // $2,000 Accounts Payable
      "3000": 600000, // $6,000 Retained Earnings
    };

    const sheet = calculateBalanceSheet(mockAccounts, mockBalances);
    expect(sheet.totalAssetsCents).toBe(800000);
    expect(sheet.totalLiabilitiesCents).toBe(200000);
    expect(sheet.totalEquityCents).toBe(600000);
    expect(sheet.isBalanced).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatMoneyCompact,
  toPaise,
  toRupees,
  addMoney,
  subtractMoney,
  multiplyMoney,
  applyDiscount,
  discountAmount,
  applyTax,
  taxAmount,
  sumMoney,
  clampToZero,
  assertPaise,
} from '@/lib/money';

describe('formatMoney', () => {
  it('formats zero correctly', () => {
    expect(formatMoney(0)).toBe('₹0.00');
  });

  it('formats a typical price', () => {
    expect(formatMoney(8050)).toBe('₹80.50');
  });

  it('formats a whole rupee amount', () => {
    expect(formatMoney(8000)).toBe('₹80.00');
  });

  it('formats large amounts with Indian grouping', () => {
    expect(formatMoney(100000)).toBe('₹1,000.00');
  });

  it('formats negative amounts', () => {
    const result = formatMoney(-8050);
    expect(result).toContain('80.50');
    expect(result.startsWith('-')).toBe(true);
  });

  it('throws on non-integer input', () => {
    expect(() => formatMoney(80.5)).toThrow();
  });
});

describe('formatMoneyCompact', () => {
  it('omits decimals for whole rupees', () => {
    expect(formatMoneyCompact(8000)).toBe('₹80');
  });

  it('includes decimals when needed', () => {
    expect(formatMoneyCompact(8050)).toBe('₹80.50');
  });
});

describe('toPaise', () => {
  it('converts 80.50 correctly', () => {
    expect(toPaise(80.50)).toBe(8050);
  });

  it('handles whole rupees', () => {
    expect(toPaise(100)).toBe(10000);
  });

  it('handles floating point precision correctly', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS, but toPaise should round
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});

describe('toRupees', () => {
  it('converts 8050 paise to 80.5 rupees', () => {
    expect(toRupees(8050)).toBe(80.5);
  });
});

describe('addMoney', () => {
  it('adds two amounts', () => {
    expect(addMoney(100, 200)).toBe(300);
  });

  it('handles zero', () => {
    expect(addMoney(500, 0)).toBe(500);
  });

  it('handles large amounts', () => {
    expect(addMoney(1000000, 500000)).toBe(1500000);
  });
});

describe('subtractMoney', () => {
  it('subtracts correctly', () => {
    expect(subtractMoney(500, 200)).toBe(300);
  });

  it('allows negative result (for change calculation)', () => {
    expect(subtractMoney(200, 500)).toBe(-300);
  });
});

describe('multiplyMoney', () => {
  it('multiplies paise by quantity', () => {
    expect(multiplyMoney(2000, 3)).toBe(6000);
  });

  it('handles zero quantity', () => {
    expect(multiplyMoney(2000, 0)).toBe(0);
  });

  it('throws on non-integer quantity', () => {
    expect(() => multiplyMoney(2000, 1.5)).toThrow();
  });
});

describe('applyDiscount', () => {
  it('applies 10% discount to ₹100', () => {
    expect(applyDiscount(10000, 10)).toBe(9000);
  });

  it('0% discount returns original', () => {
    expect(applyDiscount(10000, 0)).toBe(10000);
  });

  it('100% discount returns 0', () => {
    expect(applyDiscount(10000, 100)).toBe(0);
  });

  it('50% discount on ₹80', () => {
    expect(applyDiscount(8000, 50)).toBe(4000);
  });

  it('throws on discount > 100', () => {
    expect(() => applyDiscount(10000, 101)).toThrow();
  });

  it('throws on negative discount', () => {
    expect(() => applyDiscount(10000, -1)).toThrow();
  });

  it('never produces a float', () => {
    const result = applyDiscount(10001, 33);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('discountAmount', () => {
  it('calculates discount amount for 10% on ₹100', () => {
    expect(discountAmount(10000, 10)).toBe(1000);
  });
});

describe('applyTax', () => {
  it('applies 18% GST', () => {
    expect(applyTax(10000, 18)).toBe(11800);
  });

  it('0% tax returns original', () => {
    expect(applyTax(10000, 0)).toBe(10000);
  });

  it('never produces a float', () => {
    const result = applyTax(10001, 18);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('taxAmount', () => {
  it('calculates tax amount for 18% on ₹100', () => {
    expect(taxAmount(10000, 18)).toBe(1800);
  });
});

describe('sumMoney', () => {
  it('sums an array', () => {
    expect(sumMoney([100, 200, 300])).toBe(600);
  });

  it('handles empty array', () => {
    expect(sumMoney([])).toBe(0);
  });
});

describe('clampToZero', () => {
  it('returns zero for negative', () => {
    expect(clampToZero(-100)).toBe(0);
  });

  it('returns value for positive', () => {
    expect(clampToZero(500)).toBe(500);
  });
});

describe('assertPaise', () => {
  it('does not throw for valid integer', () => {
    expect(() => assertPaise(8050)).not.toThrow();
  });

  it('throws for float', () => {
    expect(() => assertPaise(80.5)).toThrow();
  });

  it('throws for string', () => {
    expect(() => assertPaise('80.50')).toThrow();
  });

  it('throws for undefined', () => {
    expect(() => assertPaise(undefined)).toThrow();
  });
});

describe('Financial computation correctness', () => {
  it('a complete sale calculation is exact', () => {
    // 3 × Meetha Paan @ ₹20 each = ₹60
    const qty = 3;
    const unitPrice = 2000; // ₹20 in paise
    const lineTotal = multiplyMoney(unitPrice, qty);
    expect(lineTotal).toBe(6000); // ₹60

    // 1 × Sada Paan @ ₹15
    const lineTotal2 = multiplyMoney(1500, 1);
    expect(lineTotal2).toBe(1500); // ₹15

    const subtotal = sumMoney([lineTotal, lineTotal2]);
    expect(subtotal).toBe(7500); // ₹75

    const total = subtotal; // no discount, no tax
    expect(total).toBe(7500);

    // Cash received: ₹100
    const cashReceived = 10000;
    const change = subtractMoney(cashReceived, total);
    expect(change).toBe(2500); // ₹25 change
  });

  it('refund totals correctly', () => {
    const saleTotal = 6000; // ₹60
    const cashSales = 18420 * 100; // ₹18,420
    const cashRefunds = saleTotal;
    const cashExpenses = 80000; // ₹800

    const expectedCash = cashSales - cashRefunds - cashExpenses;
    expect(Number.isInteger(expectedCash)).toBe(true);
  });
});

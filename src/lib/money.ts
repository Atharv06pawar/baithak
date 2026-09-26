/**
 * BaithakOS — Money Utility
 *
 * All monetary values are stored and computed as integer PAISE.
 * ₹1 = 100 paise. NEVER use floating-point for money.
 *
 * ₹80.50 → 8050 paise
 * ₹1,000 → 100000 paise
 */

/** Amount in paise (integer). Never a float. */
export type Paise = number;

/**
 * Format paise as a localized rupee string.
 * e.g. 8050 → "₹80.50"
 */
export function formatMoney(paise: Paise): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`formatMoney: expected integer paise, got ${paise}`);
  }
  const rupees = Math.abs(paise) / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return paise < 0 ? `-${formatted}` : formatted;
}

/**
 * Format paise as a compact rupee string (no decimals if whole rupee).
 * e.g. 8000 → "₹80", 8050 → "₹80.50"
 */
export function formatMoneyCompact(paise: Paise): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`formatMoneyCompact: expected integer paise, got ${paise}`);
  }
  const rupees = Math.abs(paise) / 100;
  const hasDecimals = paise % 100 !== 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(rupees);
  return paise < 0 ? `-${formatted}` : formatted;
}

/** Parse a rupee string or number into paise. e.g. 80.50 → 8050 */
export function toPaise(rupees: number): Paise {
  // Multiply by 100 and round to avoid floating point artifacts
  return Math.round(rupees * 100);
}

/** Convert paise to rupees as a decimal number. */
export function toRupees(paise: Paise): number {
  return paise / 100;
}

/** Add two paise amounts. */
export function addMoney(a: Paise, b: Paise): Paise {
  return a + b;
}

/** Subtract b from a in paise. May return negative. */
export function subtractMoney(a: Paise, b: Paise): Paise {
  return a - b;
}

/** Multiply paise by a whole quantity. */
export function multiplyMoney(paise: Paise, quantity: number): Paise {
  if (!Number.isInteger(quantity)) {
    throw new Error(`multiplyMoney: quantity must be an integer, got ${quantity}`);
  }
  return paise * quantity;
}

/**
 * Apply a percentage discount to a paise amount.
 * discountPercent: 0–100 (integer or up to 2 decimals).
 * Returns discounted paise (rounded).
 */
export function applyDiscount(paise: Paise, discountPercent: number): Paise {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error(`applyDiscount: discountPercent must be 0–100, got ${discountPercent}`);
  }
  if (discountPercent === 0) return paise;
  if (discountPercent === 100) return 0;
  return Math.round(paise * (1 - discountPercent / 100));
}

/**
 * Calculate discount amount in paise.
 */
export function discountAmount(paise: Paise, discountPercent: number): Paise {
  return subtractMoney(paise, applyDiscount(paise, discountPercent));
}

/**
 * Apply a tax percentage to a paise amount.
 * taxPercent: 0–100. Returns total paise including tax.
 */
export function applyTax(paise: Paise, taxPercent: number): Paise {
  if (taxPercent < 0) throw new Error(`applyTax: taxPercent must be >= 0, got ${taxPercent}`);
  if (taxPercent === 0) return paise;
  return Math.round(paise * (1 + taxPercent / 100));
}

/** Calculate tax amount in paise. */
export function taxAmount(paise: Paise, taxPercent: number): Paise {
  return subtractMoney(applyTax(paise, taxPercent), paise);
}

/** Sum an array of paise amounts. */
export function sumMoney(amounts: Paise[]): Paise {
  return amounts.reduce((acc, a) => acc + a, 0);
}

/** Clamp paise to a minimum of 0. */
export function clampToZero(paise: Paise): Paise {
  return Math.max(0, paise);
}

/** Assert a value is a valid paise integer. Throws on float or non-number. */
export function assertPaise(value: unknown, fieldName = 'amount'): asserts value is Paise {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer paise value, got: ${value}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Pure domain: trade validation & fill computation
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface BuyFillInput {
  availableCredits: number;
  pricePerUnit: number;
  quantity: number;
}

export interface BuyFillResult {
  valid: boolean;
  reason?: string;
  totalCost: number;
  quantity: number;
  pricePerUnit: number;
}

export interface SellFillInput {
  heldQuantity: number;
  pricePerUnit: number;
  quantity: number;
}

export interface SellFillResult {
  valid: boolean;
  reason?: string;
  totalProceeds: number;
  quantity: number;
  pricePerUnit: number;
}

export interface AvgPriceInput {
  currentQty: number;
  currentAvgPrice: number;
  addQty: number;
  addPrice: number;
}

export function computeBuyFill(input: BuyFillInput): BuyFillResult {
  const { availableCredits, pricePerUnit, quantity } = input;

  if (quantity <= 0) {
    return { valid: false, reason: 'Quantity must be greater than 0', totalCost: 0, quantity: 0, pricePerUnit };
  }
  if (pricePerUnit <= 0) {
    return { valid: false, reason: 'Price must be greater than 0', totalCost: 0, quantity: 0, pricePerUnit };
  }

  const totalCost = pricePerUnit * quantity;

  if (totalCost > availableCredits) {
    return { valid: false, reason: 'Insufficient credits', totalCost, quantity, pricePerUnit };
  }

  return { valid: true, totalCost, quantity, pricePerUnit };
}

export function computeSellFill(input: SellFillInput): SellFillResult {
  const { heldQuantity, pricePerUnit, quantity } = input;

  if (quantity <= 0) {
    return { valid: false, reason: 'Quantity must be greater than 0', totalProceeds: 0, quantity: 0, pricePerUnit };
  }
  if (pricePerUnit <= 0) {
    return { valid: false, reason: 'Price must be greater than 0', totalProceeds: 0, quantity: 0, pricePerUnit };
  }
  if (quantity > heldQuantity) {
    return { valid: false, reason: 'Insufficient quantity held', totalProceeds: 0, quantity, pricePerUnit };
  }

  const totalProceeds = pricePerUnit * quantity;
  return { valid: true, totalProceeds, quantity, pricePerUnit };
}

/** Weighted average price after adding new shares. */
export function computeNewAvgPrice(input: AvgPriceInput): number {
  const { currentQty, currentAvgPrice, addQty, addPrice } = input;
  if (currentQty + addQty === 0) return 0;
  const totalCost = currentQty * currentAvgPrice + addQty * addPrice;
  return Math.round(totalCost / (currentQty + addQty));
}

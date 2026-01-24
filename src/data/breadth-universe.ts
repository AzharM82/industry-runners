// Breadth Universe - combines ETF holdings, day trade stocks, and focus stocks
// for calculating market breadth indicators

import { getAllStockSymbols } from './etfs';
import { getAllDayTradeSymbols } from './daytrade';
import { FOCUS_STOCK_SYMBOLS } from './focusstocks';

/**
 * Get the combined breadth universe of all unique stock symbols
 * Excludes ETF symbols (like SPY, QQQ) to focus on individual stocks
 */
export function getBreadthUniverse(): string[] {
  const symbols = new Set<string>();

  // Add ETF holdings (individual stocks)
  getAllStockSymbols().forEach(s => symbols.add(s));

  // Add day trade stocks
  getAllDayTradeSymbols().forEach(s => symbols.add(s));

  // Add focus stocks
  FOCUS_STOCK_SYMBOLS.forEach(s => symbols.add(s));

  // Convert to array and sort for consistency
  return Array.from(symbols).sort();
}

/**
 * Get the count of unique symbols in the breadth universe
 */
export function getBreadthUniverseCount(): number {
  return getBreadthUniverse().length;
}

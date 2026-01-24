export interface StockQuote {
  symbol: string;
  name?: string;
  last: number;
  change: number;
  changePercent: number;
  changeFromOpen: number;
  changeFromOpenPercent: number;
  open: number;
  previousClose: number;
  high: number;
  low: number;
  marketCap?: number;
  volume: number;
  week52High: number;
  week52Low: number;
  avgVolume?: number;
  timestamp?: number;
  // 5-day change
  change5Day?: number;
  // Relative strength vs ETF
  relativeStrength?: number;
}

export interface ETF {
  symbol: string;
  name: string;
  holdings: string[];
}

export interface ETFWithData extends ETF {
  stocks: StockQuote[];
  etfQuote?: StockQuote;
  medianChangeFromOpen: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePercent: number;
  change5Day?: number;
}

export interface DayTradeStock {
  symbol: string;
  name: string;
  last: number;
  atr: number;
  atrPercent: number;
  avgVolume: number;
  volume: number;
  changePercent: number;
  changeFromOpenPercent: number;
  high: number;
  low: number;
  open: number;
}

export interface DayTradeGroup {
  name: string;
  stocks: DayTradeStock[];
  avgChangePercent: number;
}

// Stock Analysis Types
export interface StockAnalysis {
  // Basic Info
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  sector: string;
  industry: string;
  employees: number;
  website: string;

  // Quote Data
  last: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  week52High: number;
  week52Low: number;

  // Financials (quarterly data)
  incomeStatements: IncomeStatement[];
  balanceSheets: BalanceSheet[];
  cashFlows: CashFlowStatement[];

  // Ratios
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;

  // Dividends
  dividends: DividendInfo[];
  dividendYield: number | null;
}

export interface IncomeStatement {
  period: string;
  fiscalYear: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  operatingExpense: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  ebitda: number;
}

export interface BalanceSheet {
  period: string;
  fiscalYear: string;
  cash: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
}

export interface CashFlowStatement {
  period: string;
  fiscalYear: string;
  netIncome: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  freeCashFlow: number;
}

export interface DividendInfo {
  exDate: string;
  payDate: string;
  amount: number;
  frequency: number;
}

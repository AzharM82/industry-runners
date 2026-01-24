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

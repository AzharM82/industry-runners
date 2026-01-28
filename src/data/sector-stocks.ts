export interface SectorData {
  name: string;
  shortName: string;
  stocks: string[];
}

export const SECTORS: SectorData[] = [
  {
    name: 'Technology',
    shortName: 'Tech',
    stocks: ['NVDA', 'INTC', 'AAPL', 'AMD', 'AVGO', 'MSFT', 'GOOG', 'MU', 'CSCO', 'MRVL', 'LRCX', 'TSM', 'QCOM', 'TXN', 'AMAT']
  },
  {
    name: 'Consumer Cyclical',
    shortName: 'Discr',
    stocks: ['TSLA', 'AMZN', 'F', 'HD', 'GM', 'NKE', 'MCD', 'SBUX', 'LOW', 'BKNG', 'TJX', 'ROST', 'DHI', 'LEN', 'MAR']
  },
  {
    name: 'Healthcare',
    shortName: 'Health',
    stocks: ['PFE', 'LLY', 'JNJ', 'UNH', 'MRK', 'ABBV', 'AMGN', 'GILD', 'BMY', 'CVS', 'ISRG', 'BSX', 'MDT', 'ZTS', 'VRTX']
  },
  {
    name: 'Financial',
    shortName: 'Fin',
    stocks: ['BAC', 'JPM', 'C', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'USB', 'PNC', 'AXP', 'V', 'MA', 'HOOD', 'SOFI']
  },
  {
    name: 'Communication Services',
    shortName: 'Comm',
    stocks: ['T', 'CMCSA', 'VZ', 'META', 'NFLX', 'DIS', 'TMUS', 'WBD', 'CHTR', 'EA', 'TTWO', 'SPOT', 'PARA', 'FOX', 'OMC']
  },
  {
    name: 'Energy',
    shortName: 'Energy',
    stocks: ['XOM', 'CVX', 'OXY', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'HAL', 'DVN', 'FANG', 'BKR', 'KMI', 'WMB']
  },
  {
    name: 'Consumer Defensive',
    shortName: 'Staple',
    stocks: ['WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'CL', 'MDLZ', 'GIS', 'KHC', 'K', 'SYY', 'KR', 'TGT']
  },
  {
    name: 'Utilities',
    shortName: 'Util',
    stocks: ['NEE', 'DUK', 'SO', 'D', 'AEP', 'XEL', 'SRE', 'EXC', 'WEC', 'ED', 'PCG', 'EIX', 'CEG', 'AWK', 'AES']
  },
  {
    name: 'Basic Materials',
    shortName: 'Matl',
    stocks: ['FCX', 'LIN', 'NUE', 'NEM', 'APD', 'SHW', 'DD', 'DOW', 'PPG', 'ECL', 'CTVA', 'CF', 'MOS', 'CLF', 'X']
  },
  {
    name: 'Real Estate',
    shortName: 'RE',
    stocks: ['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'WELL', 'PSA', 'DLR', 'CCI', 'AVB', 'EQR', 'VTR', 'SBAC', 'ARE', 'MAA']
  },
  {
    name: 'Industrials',
    shortName: 'Indus',
    stocks: ['BA', 'CAT', 'HON', 'UNP', 'UPS', 'RTX', 'LMT', 'GE', 'GEV', 'ETN', 'DE', 'FDX', 'NOC', 'WM', 'CSX']
  }
];

// Get all unique stock symbols for batch fetching
export const getAllSectorSymbols = (): string[] => {
  const symbols = new Set<string>();
  SECTORS.forEach(sector => {
    sector.stocks.forEach(stock => symbols.add(stock));
  });
  return Array.from(symbols);
};

// Get sector by stock symbol
export const getSectorBySymbol = (symbol: string): SectorData | undefined => {
  return SECTORS.find(sector => sector.stocks.includes(symbol));
};

import type { ETF } from '../types';

export const ETF_DATA: ETF[] = [
  {
    symbol: 'SMH',
    name: 'Semiconductors',
    holdings: ['NVDA', 'TSM', 'AVGO', 'MU', 'ASML', 'LRCX', 'INTC', 'KLAC', 'AMD', 'AMAT', 'MRVL', 'QCOM', 'TXN', 'ON', 'MPWR', 'ADI', 'NXPI', 'SWKS']
  },
  {
    symbol: 'FDN',
    name: 'Internet',
    holdings: ['META', 'AMZN', 'GOOGL', 'NFLX', 'CRM', 'ABNB', 'PYPL', 'SHOP', 'UBER', 'NOW', 'SPOT', 'PINS', 'SNAP', 'ZM', 'ETSY', 'GDDY', 'IAC', 'DBX']
  },
  {
    symbol: 'IGV',
    name: 'Software',
    holdings: ['MSFT', 'CRM', 'ADBE', 'INTU', 'NOW', 'ORCL', 'SNPS', 'PANW', 'CDNS', 'WDAY', 'DDOG', 'TEAM', 'PLTR', 'HUBS', 'VEEV', 'TTD', 'ANSS', 'MANH']
  },
  {
    symbol: 'KWEB',
    name: 'China Internet',
    holdings: ['TCEHY', 'BABA', 'PDD', 'MPNGY', 'NTES', 'KUAIY', 'JD', 'BIDU', 'TCOM', 'BEKE', 'BILI', 'LI', 'XPEV', 'NIO', 'ZTO', 'IQ', 'KC', 'BZUN']
  },
  {
    symbol: 'CIBR',
    name: 'Cybersecurity',
    holdings: ['AVGO', 'PANW', 'FTNT', 'CRWD', 'CSCO', 'OKTA', 'ZS', 'CHKP', 'GEN', 'BB', 'CYBR', 'QLYS', 'TENB', 'RPD', 'VRNS', 'S', 'FFIV', 'AKAM']
  },
  {
    symbol: 'BLOK',
    name: 'Blockchain',
    holdings: ['BITB', 'IBIT', 'CME', 'CUBI', 'HUT', 'GLXY', 'HOOD', 'CIFR', 'CLSK', 'COIN', 'MARA', 'RIOT', 'MSTR', 'SQ', 'IBM', 'OSTK', 'SI', 'BTBT']
  },
  {
    symbol: 'ROBO',
    name: 'Robotics & AI',
    holdings: ['ISRG', 'TER', 'ROK', 'NOVT', 'SYM', 'HON', 'ABB', 'IRBT', 'KUKA', 'FANUY', 'CGNX', 'BRKS', 'PATH', 'AI', 'UPST', 'BILL', 'MTSI', 'NNDM']
  },
  {
    symbol: 'XLE',
    name: 'Energy',
    holdings: ['XOM', 'CVX', 'COP', 'SLB', 'WMB', 'EOG', 'PSX', 'VLO', 'KMI', 'MPC', 'HAL', 'OKE', 'DVN', 'FANG', 'BKR', 'TRGP', 'OXY', 'HES', 'CTRA']
  },
  {
    symbol: 'XOP',
    name: 'Oil & Gas E&P',
    holdings: ['TPL', 'CVX', 'XOM', 'VLO', 'DVN', 'OXY', 'PBF', 'COP', 'HES', 'FANG', 'MRO', 'APA', 'MGY', 'MTDR', 'CHRD', 'PR', 'SM', 'NOG', 'VTLE', 'AR']
  },
  {
    symbol: 'TAN',
    name: 'Solar',
    holdings: ['FSLR', 'NXT', 'RUN', 'ENPH', 'HASI', 'SEDG', 'DQ', 'ARRY', 'NOVA', 'MAXN', 'CSIQ', 'SPWR', 'BEEM', 'SOL', 'JKS', 'SHLS', 'BE']
  },
  {
    symbol: 'XME',
    name: 'Metals & Mining',
    holdings: ['AA', 'CDE', 'HL', 'HCC', 'FCX', 'RGLD', 'CLF', 'NEM', 'CMC', 'X', 'STLD', 'NUE', 'RS', 'ATI', 'CENX', 'BTU', 'ARCH', 'AMR']
  },
  {
    symbol: 'XLB',
    name: 'Materials',
    holdings: ['LIN', 'APD', 'SHW', 'CTVA', 'FCX', 'ECL', 'NEM', 'DD', 'PPG', 'VMC', 'IFF', 'MLM', 'ALB', 'BALL', 'FMC', 'CF', 'MOS', 'CE', 'EMN']
  },
  {
    symbol: 'GDX',
    name: 'Gold Miners',
    holdings: ['AEM', 'NEM', 'GOLD', 'AU', 'WPM', 'GFI', 'FNV', 'KGC', 'PAAS', 'AGI', 'HMY', 'IAG', 'BTG', 'EGO', 'SSRM', 'MAG', 'EXK', 'NGD']
  },
  {
    symbol: 'XLV',
    name: 'Healthcare',
    holdings: ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN', 'PFE', 'SYK', 'GILD', 'REGN', 'MDT', 'CVS', 'ELV', 'CI', 'BMY']
  },
  {
    symbol: 'XBI',
    name: 'Biotech',
    holdings: ['RVMD', 'MRNA', 'FOLD', 'KRYS', 'ROIV', 'HALO', 'PRAX', 'EXEL', 'INCY', 'VRTX', 'BIIB', 'BMRN', 'ALNY', 'SRPT', 'ARGX', 'IONS', 'SGEN', 'UTHR']
  },
  {
    symbol: 'MSOS',
    name: 'Cannabis',
    holdings: ['TCNNF', 'CURLF', 'GTBIF', 'CRLBF', 'GLASF', 'VRNOF', 'TSNDF', 'JUSHF', 'VFF', 'CXXIF', 'CGC', 'TLRY', 'ACB', 'OGI', 'CRON', 'SNDL', 'GRWG', 'SMG']
  },
  {
    symbol: 'XLF',
    name: 'Financials',
    holdings: ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'GS', 'WFC', 'MS', 'C', 'AXP', 'SPGI', 'BLK', 'CB', 'PGR', 'SCHW', 'MMC', 'ICE', 'AON', 'TRV']
  },
  {
    symbol: 'XLY',
    name: 'Consumer Discretionary',
    holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'BKNG', 'SBUX', 'TJX', 'ORLY', 'DHI', 'LEN', 'ROST', 'YUM', 'AZO', 'POOL', 'DECK', 'GRMN']
  },
  {
    symbol: 'XRT',
    name: 'Retail',
    holdings: ['CVNA', 'KMX', 'AN', 'M', 'JWN', 'KSS', 'GPS', 'GME', 'BBY', 'TSCO', 'W', 'DKS', 'ULTA', 'BBWI', 'BOOT', 'BKE', 'FIVE', 'CAL']
  },
  {
    symbol: 'XLP',
    name: 'Consumer Staples',
    holdings: ['PG', 'COST', 'PEP', 'KO', 'PM', 'WMT', 'MDLZ', 'MO', 'TGT', 'CL', 'KHC', 'GIS', 'SYY', 'HSY', 'K', 'CAG', 'TSN', 'HRL', 'CPB']
  },
  {
    symbol: 'PEJ',
    name: 'Leisure & Entertainment',
    holdings: ['DIS', 'NFLX', 'BKNG', 'MAR', 'HLT', 'RCL', 'CCL', 'CMG', 'DASH', 'DRI', 'LVS', 'MGM', 'WYNN', 'SIX', 'SEAS', 'LYV', 'MTCH', 'EXPE']
  },
  {
    symbol: 'ITA',
    name: 'Aerospace & Defense',
    holdings: ['GE', 'RTX', 'BA', 'LHX', 'LMT', 'HWM', 'NOC', 'AXON', 'TDG', 'GD', 'HII', 'LDOS', 'SAIC', 'HEI', 'TXT', 'CW', 'SPR', 'ERJ']
  },
  {
    symbol: 'ITB',
    name: 'Homebuilders',
    holdings: ['DHI', 'LEN', 'NVR', 'PHM', 'TOL', 'SHW', 'OC', 'HD', 'LOW', 'BLD', 'MHO', 'TMHC', 'KBH', 'MDC', 'MTH', 'CCS', 'GRBK', 'MAS', 'DOOR']
  },
  {
    symbol: 'IYT',
    name: 'Transportation',
    holdings: ['UNP', 'UPS', 'FDX', 'ODFL', 'CSX', 'NSC', 'R', 'LUV', 'DAL', 'UAL', 'JBHT', 'EXPD', 'XPO', 'KNX', 'SAIA', 'WERN', 'LSTR', 'SNDR', 'CHRW']
  },
  {
    symbol: 'IYZ',
    name: 'Telecom',
    holdings: ['CSCO', 'CMCSA', 'T', 'VZ', 'TMUS', 'AMT', 'CCI', 'EQIX', 'SBAC', 'CHTR', 'LUMN', 'DISH', 'USM', 'GSAT', 'IRDM', 'LBRDA', 'CABO', 'SATS']
  }
];

// Get all unique stock symbols for batch fetching
export const getAllStockSymbols = (): string[] => {
  const symbols = new Set<string>();
  ETF_DATA.forEach(etf => {
    symbols.add(etf.symbol); // Add ETF itself
    etf.holdings.forEach(stock => symbols.add(stock));
  });
  return Array.from(symbols);
};

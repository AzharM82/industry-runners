// Focus Stocks - symbols from finviz.csv screening
// This list should be updated periodically based on your screening criteria

export const FOCUS_STOCK_SYMBOLS = [
  'A', 'AAPL', 'ABBV', 'ABNB', 'ABT', 'ACN', 'ADBE', 'ADI', 'ADP', 'ADSK',
  'AEM', 'AFRM', 'AJG', 'ALAB', 'ALB', 'ALGN', 'ALL', 'ALLE', 'ALNY', 'AMAT',
  'AMD', 'AME', 'AMGN', 'AMKR', 'AMP', 'AMT', 'AMZN', 'ANET', 'AON', 'APD',
  'APH', 'APLD', 'APO', 'APP', 'ARES', 'ARM', 'ASML', 'ASND', 'ASTS', 'ATI',
  'AU', 'AVAV', 'AVB', 'AVGO', 'AVY', 'AXON', 'AXP', 'BA', 'BABA', 'BAH',
  'BBIO', 'BDX', 'BE', 'BIDU', 'BIIB', 'BLDR', 'BLK', 'BNTX', 'BR', 'BRK-B',
  'BURL', 'BWXT', 'BX', 'C', 'CAH', 'CAT', 'CB', 'CBOE', 'CBRE', 'CCJ',
  'CDNS', 'CDW', 'CEG', 'CHKP', 'CHRW', 'CHTR', 'CI', 'CIEN', 'CLH', 'CLS',
  'CME', 'CMI', 'COF', 'COHR', 'COIN', 'COKE', 'COR', 'COST', 'CPAY', 'CRCL',
  'CRDO', 'CRH', 'CRL', 'CRM', 'CRS', 'CRWD', 'CRWV', 'CTAS', 'CVNA', 'CVX',
  'CYBR', 'DASH', 'DDOG', 'DE', 'DECK', 'DELL', 'DG', 'DGX', 'DHI', 'DHR',
  'DKS', 'DLR', 'DLTR', 'DOV', 'DPZ', 'DRI', 'ECL', 'EFX', 'EL', 'ELV',
  'EMR', 'ENTG', 'EPAM', 'EQIX', 'ESS', 'ETN', 'EXE', 'EXPE', 'EXR', 'FANG',
  'FDS', 'FDX', 'FERG', 'FFIV', 'FIGR', 'FIVE', 'FIX', 'FLUT', 'FN', 'FNV',
  'FSLR', 'FTAI', 'FUTU', 'GD', 'GE', 'GEV', 'GH', 'GILD', 'GLW', 'GNRC',
  'GOOG', 'GOOGL', 'GRMN', 'GS', 'GWRE', 'H', 'HCA', 'HD', 'HII', 'HLT',
  'HON', 'HOOD', 'HSY', 'HUBB', 'HUBS', 'HUM', 'HWM', 'IBM', 'ICE', 'ICLR',
  'IDXX', 'IEX', 'ILMN', 'INCY', 'INSM', 'INTC', 'INTU', 'IONQ', 'IQV', 'IREN',
  'ISRG', 'IT', 'ITT', 'ITW', 'J', 'JAZZ', 'JBHT', 'JBL', 'JKHY', 'JNJ',
  'JPM', 'KEYS', 'KKR', 'KLAC', 'KRMN', 'KTOS', 'LDOS', 'LEN', 'LH', 'LHX',
  'LIN', 'LITE', 'LLY', 'LMT', 'LNG', 'LOW', 'LPLA', 'LRCX', 'LSCC', 'LULU',
  'LYV', 'MA', 'MANH', 'MAR', 'MCD', 'MCK', 'MCO', 'MDB', 'MELI', 'META',
  'MKSI', 'MMM', 'MOH', 'MP', 'MPC', 'MPWR', 'MRSH', 'MRVL', 'MS', 'MSCI',
  'MSFT', 'MSI', 'MSTR', 'MTB', 'MTSI', 'MTZ', 'MU', 'NBIS', 'NBIX', 'NEM',
  'NET', 'NOC', 'NOW', 'NRG', 'NSC', 'NTAP', 'NTES', 'NTRA', 'NTRS', 'NUE',
  'NVDA', 'NVT', 'NXPI', 'NXT', 'OC', 'ODFL', 'OKLO', 'OKTA', 'ONTO', 'ORCL',
  'PANW', 'PDD', 'PEN', 'PGR', 'PH', 'PHM', 'PKG', 'PLTR', 'PM', 'PNC',
  'PNFP', 'PODD', 'PSA', 'PSTG', 'PSX', 'PTC', 'PWR', 'Q', 'QCOM', 'RACE',
  'RBLX', 'RCL', 'RDDT', 'REGN', 'RGLD', 'RJF', 'RKLB', 'RL', 'RMBS', 'RMD',
  'ROK', 'ROKU', 'ROP', 'ROST', 'RRX', 'RTX', 'RVMD', 'RVTY', 'SAP', 'SATS',
  'SBAC', 'SCCO', 'SE', 'SF', 'SHOP', 'SHW', 'SN', 'SNDK', 'SNOW', 'SNPS',
  'SNX', 'SPG', 'SPGI', 'SPOT', 'SPXC', 'STE', 'STLD', 'STRL', 'STT', 'STX',
  'STZ', 'SYK', 'SYM', 'TEAM', 'TEL', 'TEM', 'TER', 'TGT', 'THC', 'TKO',
  'TLN', 'TMO', 'TMUS', 'TOL', 'TPR', 'TRGP', 'TRV', 'TSEM', 'TSLA', 'TSM',
  'TT', 'TTWO', 'TWLO', 'TXN', 'TXRH', 'UAL', 'UHS', 'ULTA', 'UNH', 'UNP',
  'URI', 'V', 'VEEV', 'VLO', 'VMC', 'VRSK', 'VRSN', 'VRT', 'VRTX', 'VST',
  'W', 'WAB', 'WAT', 'WCC', 'WDAY', 'WDC', 'WELL', 'WLK', 'WM', 'WMS',
  'WPM', 'WSM', 'WST', 'WTW', 'WWD', 'WYNN', 'XPO', 'ZBRA', 'ZS'
];

export function getFocusStockSymbols(): string[] {
  return FOCUS_STOCK_SYMBOLS;
}

// Day Trading stock data - sourced from Industry_Stock_Dashboard.xlsx
// ATR data should be updated weekly

export interface DayTradeStockData {
  symbol: string;
  name: string;
  atr: number;
  atrPercent: number;
  avgVolume: number;
}

export interface DayTradeIndustry {
  name: string;
  stocks: DayTradeStockData[];
}

export const DAYTRADE_INDUSTRIES: DayTradeIndustry[] = [
  {
    name: "Crypto Currency",
    stocks: [
      { symbol: "MARA", name: "MARA Holdings Inc", atr: 1.85, atrPercent: 18.2, avgVolume: 42500000 },
      { symbol: "RIOT", name: "Riot Platforms Inc", atr: 1.72, atrPercent: 11.9, avgVolume: 35200000 },
      { symbol: "CLSK", name: "CleanSpark Inc", atr: 1.58, atrPercent: 13.1, avgVolume: 28400000 },
      { symbol: "WULF", name: "TeraWulf Inc", atr: 1.42, atrPercent: 11.3, avgVolume: 15600000 },
      { symbol: "CIFR", name: "Cipher Mining Inc", atr: 1.35, atrPercent: 8.3, avgVolume: 12800000 },
      { symbol: "BITF", name: "Bitfarms Ltd", atr: 0.32, atrPercent: 12.6, avgVolume: 18500000 },
      { symbol: "HIVE", name: "HIVE Digital Tech", atr: 0.28, atrPercent: 9.9, avgVolume: 4200000 },
      { symbol: "CAN", name: "Canaan Inc", atr: 0.12, atrPercent: 14.6, avgVolume: 8500000 },
      { symbol: "GREE", name: "Greenidge Generation", atr: 0.18, atrPercent: 10.7, avgVolume: 1200000 },
      { symbol: "BKKT", name: "Bakkt Holdings", atr: 0.95, atrPercent: 11.2, avgVolume: 2500000 },
    ],
  },
  {
    name: "Gold Miners",
    stocks: [
      { symbol: "KGC", name: "Kinross Gold Corp", atr: 0.68, atrPercent: 4.6, avgVolume: 18500000 },
      { symbol: "EGO", name: "Eldorado Gold Corp", atr: 0.95, atrPercent: 4.4, avgVolume: 2800000 },
      { symbol: "BTG", name: "B2Gold Corp", atr: 0.18, atrPercent: 4.4, avgVolume: 8500000 },
      { symbol: "CDE", name: "Coeur Mining Inc", atr: 0.42, atrPercent: 4.7, avgVolume: 6200000 },
      { symbol: "FSM", name: "Fortuna Silver Mines", atr: 0.32, atrPercent: 4.4, avgVolume: 3500000 },
      { symbol: "IAG", name: "IAMGOLD Corp", atr: 0.38, atrPercent: 4.7, avgVolume: 4800000 },
      { symbol: "NGD", name: "New Gold Inc", atr: 0.18, atrPercent: 4.7, avgVolume: 5200000 },
      { symbol: "AG", name: "First Majestic Silver", atr: 0.45, atrPercent: 4.8, avgVolume: 7500000 },
      { symbol: "HL", name: "Hecla Mining Co", atr: 0.38, atrPercent: 4.4, avgVolume: 8200000 },
      { symbol: "PAAS", name: "Pan American Silver", atr: 1.15, atrPercent: 4.4, avgVolume: 3800000 },
    ],
  },
  {
    name: "Metal & Mining",
    stocks: [
      { symbol: "CLF", name: "Cleveland-Cliffs Inc", atr: 0.52, atrPercent: 5.3, avgVolume: 22500000 },
      { symbol: "X", name: "United States Steel", atr: 1.35, atrPercent: 4.7, avgVolume: 8500000 },
      { symbol: "AA", name: "Alcoa Corporation", atr: 1.42, atrPercent: 4.8, avgVolume: 5800000 },
      { symbol: "MP", name: "MP Materials Corp", atr: 1.18, atrPercent: 5.3, avgVolume: 3500000 },
      { symbol: "CENX", name: "Century Aluminum Co", atr: 0.95, atrPercent: 5.1, avgVolume: 1800000 },
      { symbol: "UUUU", name: "Energy Fuels Inc", atr: 0.42, atrPercent: 6.1, avgVolume: 4200000 },
      { symbol: "LAC", name: "Lithium Americas", atr: 0.22, atrPercent: 6.4, avgVolume: 5800000 },
      { symbol: "SVM", name: "Silvercorp Metals", atr: 0.28, atrPercent: 5.3, avgVolume: 1500000 },
      { symbol: "EXK", name: "Endeavour Silver", atr: 0.25, atrPercent: 5.1, avgVolume: 2800000 },
      { symbol: "ZEUS", name: "Olympic Steel Inc", atr: 1.25, atrPercent: 4.3, avgVolume: 580000 },
    ],
  },
  {
    name: "Defense & Aero.",
    stocks: [
      { symbol: "RKLB", name: "Rocket Lab USA Inc", atr: 2.15, atrPercent: 7.5, avgVolume: 18500000 },
      { symbol: "LUNR", name: "Intuitive Machines", atr: 1.85, atrPercent: 8.2, avgVolume: 8500000 },
      { symbol: "KTOS", name: "Kratos Defense", atr: 1.45, atrPercent: 5.2, avgVolume: 2800000 },
      { symbol: "ASTS", name: "AST SpaceMobile", atr: 1.95, atrPercent: 7.8, avgVolume: 12500000 },
      { symbol: "RDW", name: "Redwire Corporation", atr: 0.85, atrPercent: 6.8, avgVolume: 1800000 },
      { symbol: "GILT", name: "Gilat Satellite Net", atr: 0.42, atrPercent: 4.7, avgVolume: 850000 },
      { symbol: "MRCY", name: "Mercury Systems", atr: 1.25, atrPercent: 4.5, avgVolume: 1200000 },
      { symbol: "SPCE", name: "Virgin Galactic", atr: 0.45, atrPercent: 7.7, avgVolume: 8500000 },
      { symbol: "MNTS", name: "Momentus Inc", atr: 0.32, atrPercent: 9.3, avgVolume: 1500000 },
      { symbol: "LLAP", name: "Terran Orbital Corp", atr: 0.28, atrPercent: 9.8, avgVolume: 2200000 },
    ],
  },
  {
    name: "Energy",
    stocks: [
      { symbol: "ET", name: "Energy Transfer LP", atr: 0.52, atrPercent: 2.8, avgVolume: 18500000 },
      { symbol: "PAA", name: "Plains All American", atr: 0.48, atrPercent: 2.6, avgVolume: 4500000 },
      { symbol: "WES", name: "Western Midstream", atr: 0.72, atrPercent: 2.5, avgVolume: 2800000 },
      { symbol: "CTRA", name: "Coterra Energy Inc", atr: 0.68, atrPercent: 2.7, avgVolume: 8500000 },
      { symbol: "SM", name: "SM Energy Company", atr: 0.95, atrPercent: 3.3, avgVolume: 2200000 },
      { symbol: "NOG", name: "Northern Oil and Gas", atr: 0.85, atrPercent: 3.0, avgVolume: 2500000 },
      { symbol: "VET", name: "Vermilion Energy", atr: 0.38, atrPercent: 3.9, avgVolume: 1800000 },
      { symbol: "ERF", name: "Enerplus Corporation", atr: 0.42, atrPercent: 3.4, avgVolume: 1500000 },
      { symbol: "SD", name: "SandRidge Energy", atr: 0.48, atrPercent: 4.4, avgVolume: 850000 },
      { symbol: "REI", name: "Ring Energy Inc", atr: 0.08, atrPercent: 5.5, avgVolume: 2200000 },
    ],
  },
  {
    name: "Materials",
    stocks: [
      { symbol: "HUN", name: "Huntsman Corporation", atr: 0.65, atrPercent: 3.4, avgVolume: 2800000 },
      { symbol: "TROX", name: "Tronox Holdings", atr: 0.42, atrPercent: 4.4, avgVolume: 2200000 },
      { symbol: "CC", name: "Chemours Company", atr: 0.68, atrPercent: 4.6, avgVolume: 3500000 },
      { symbol: "KRO", name: "Kronos Worldwide", atr: 0.52, atrPercent: 4.2, avgVolume: 580000 },
      { symbol: "MTX", name: "Minerals Tech Inc", atr: 0.95, atrPercent: 3.3, avgVolume: 520000 },
      { symbol: "CBT", name: "Cabot Corporation", atr: 0.85, atrPercent: 2.9, avgVolume: 680000 },
      { symbol: "GEVO", name: "Gevo Inc", atr: 0.15, atrPercent: 8.1, avgVolume: 4500000 },
      { symbol: "KALU", name: "Kaiser Aluminum", atr: 1.15, atrPercent: 4.0, avgVolume: 520000 },
      { symbol: "RYAM", name: "Rayonier Advanced", atr: 0.28, atrPercent: 4.8, avgVolume: 850000 },
      { symbol: "IOSP", name: "Innospec Inc", atr: 0.92, atrPercent: 3.2, avgVolume: 520000 },
    ],
  },
  {
    name: "Financials",
    stocks: [
      { symbol: "SOFI", name: "SoFi Technologies", atr: 0.95, atrPercent: 5.6, avgVolume: 42500000 },
      { symbol: "UPST", name: "Upstart Holdings", atr: 2.15, atrPercent: 7.6, avgVolume: 8500000 },
      { symbol: "LC", name: "LendingClub Corp", atr: 0.72, atrPercent: 5.6, avgVolume: 2800000 },
      { symbol: "NU", name: "Nu Holdings Ltd", atr: 0.52, atrPercent: 4.2, avgVolume: 28500000 },
      { symbol: "KEY", name: "KeyCorp", atr: 0.48, atrPercent: 3.2, avgVolume: 12500000 },
      { symbol: "RF", name: "Regions Financial", atr: 0.58, atrPercent: 2.6, avgVolume: 8500000 },
      { symbol: "HBAN", name: "Huntington Bancshares", atr: 0.42, atrPercent: 2.6, avgVolume: 12500000 },
      { symbol: "ZION", name: "Zions Bancorporation", atr: 0.85, atrPercent: 2.9, avgVolume: 2500000 },
      { symbol: "CMA", name: "Comerica Inc", atr: 0.92, atrPercent: 3.2, avgVolume: 1800000 },
      { symbol: "FHN", name: "First Horizon Corp", atr: 0.52, atrPercent: 2.8, avgVolume: 4500000 },
    ],
  },
  {
    name: "Oil & Gas Expl P.",
    stocks: [
      { symbol: "OVV", name: "Ovintiv Inc", atr: 1.15, atrPercent: 4.0, avgVolume: 4500000 },
      { symbol: "APA", name: "APA Corporation", atr: 0.95, atrPercent: 4.2, avgVolume: 6500000 },
      { symbol: "CNX", name: "CNX Resources Corp", atr: 1.08, atrPercent: 3.8, avgVolume: 2800000 },
      { symbol: "RRC", name: "Range Resources", atr: 1.05, atrPercent: 3.7, avgVolume: 3500000 },
      { symbol: "AR", name: "Antero Resources", atr: 1.12, atrPercent: 3.9, avgVolume: 4200000 },
      { symbol: "CPE", name: "Callon Petroleum", atr: 1.25, atrPercent: 4.4, avgVolume: 1800000 },
      { symbol: "MTDR", name: "Matador Resources", atr: 1.18, atrPercent: 4.1, avgVolume: 2500000 },
      { symbol: "TELL", name: "Tellurian Inc", atr: 0.12, atrPercent: 9.6, avgVolume: 18500000 },
      { symbol: "RIG", name: "Transocean Ltd", atr: 0.22, atrPercent: 5.7, avgVolume: 22500000 },
      { symbol: "PTEN", name: "Patterson-UTI Energy", atr: 0.38, atrPercent: 4.5, avgVolume: 5800000 },
    ],
  },
  {
    name: "Staples",
    stocks: [
      { symbol: "KHC", name: "Kraft Heinz Company", atr: 0.62, atrPercent: 2.1, avgVolume: 8500000 },
      { symbol: "BGS", name: "B&G Foods Inc", atr: 0.32, atrPercent: 3.8, avgVolume: 1800000 },
      { symbol: "HAIN", name: "Hain Celestial Group", atr: 0.28, atrPercent: 4.8, avgVolume: 1500000 },
      { symbol: "THS", name: "TreeHouse Foods Inc", atr: 0.85, atrPercent: 3.0, avgVolume: 850000 },
      { symbol: "UNFI", name: "United Natural Foods", atr: 0.58, atrPercent: 4.5, avgVolume: 1200000 },
      { symbol: "SPTN", name: "SpartanNash Company", atr: 0.52, atrPercent: 2.8, avgVolume: 580000 },
      { symbol: "SMPL", name: "Simply Good Foods", atr: 0.72, atrPercent: 2.5, avgVolume: 1200000 },
      { symbol: "FARM", name: "Farmer Brothers Co", atr: 0.18, atrPercent: 6.3, avgVolume: 520000 },
      { symbol: "JBSS", name: "John B. Sanfilippo", atr: 0.75, atrPercent: 2.6, avgVolume: 520000 },
      { symbol: "NOMD", name: "Nomad Foods Ltd", atr: 0.48, atrPercent: 2.6, avgVolume: 1800000 },
    ],
  },
  {
    name: "Biotechnologies",
    stocks: [
      { symbol: "MRNA", name: "Moderna Inc", atr: 2.45, atrPercent: 8.5, avgVolume: 12500000 },
      { symbol: "BEAM", name: "Beam Therapeutics", atr: 1.85, atrPercent: 8.2, avgVolume: 2800000 },
      { symbol: "CRSP", name: "CRISPR Therapeutics", atr: 1.95, atrPercent: 6.9, avgVolume: 2500000 },
      { symbol: "NTLA", name: "Intellia Therapeutics", atr: 0.95, atrPercent: 7.4, avgVolume: 2200000 },
      { symbol: "EDIT", name: "Editas Medicine", atr: 0.25, atrPercent: 8.8, avgVolume: 3500000 },
      { symbol: "ARWR", name: "Arrowhead Pharma", atr: 1.15, atrPercent: 6.2, avgVolume: 2800000 },
      { symbol: "IONS", name: "Ionis Pharmaceuticals", atr: 1.25, atrPercent: 4.3, avgVolume: 1800000 },
      { symbol: "RCKT", name: "Rocket Pharma Inc", atr: 0.85, atrPercent: 5.7, avgVolume: 850000 },
      { symbol: "QURE", name: "uniQure N.V.", atr: 0.32, atrPercent: 6.6, avgVolume: 1200000 },
      { symbol: "RVMD", name: "Revolution Medicines", atr: 1.45, atrPercent: 5.1, avgVolume: 1800000 },
    ],
  },
  {
    name: "Retail",
    stocks: [
      { symbol: "AEO", name: "American Eagle", atr: 0.72, atrPercent: 4.8, avgVolume: 4500000 },
      { symbol: "EXPR", name: "Express Inc", atr: 0.22, atrPercent: 9.0, avgVolume: 2800000 },
      { symbol: "TLYS", name: "Tilly's Inc", atr: 0.32, atrPercent: 6.6, avgVolume: 850000 },
      { symbol: "ZUMZ", name: "Zumiez Inc", atr: 0.85, atrPercent: 4.6, avgVolume: 580000 },
      { symbol: "CATO", name: "Cato Corporation", atr: 0.28, atrPercent: 4.8, avgVolume: 520000 },
      { symbol: "SBH", name: "Sally Beauty Holdings", atr: 0.52, atrPercent: 4.2, avgVolume: 2200000 },
      { symbol: "CTRN", name: "Citi Trends Inc", atr: 1.15, atrPercent: 5.0, avgVolume: 580000 },
      { symbol: "BKE", name: "Buckle Inc", atr: 0.85, atrPercent: 3.0, avgVolume: 850000 },
      { symbol: "SCVL", name: "Shoe Carnival Inc", atr: 0.92, atrPercent: 3.2, avgVolume: 520000 },
      { symbol: "HIBB", name: "Hibbett Inc", atr: 0.95, atrPercent: 3.3, avgVolume: 580000 },
    ],
  },
  {
    name: "Consumer Disc.",
    stocks: [
      { symbol: "LCID", name: "Lucid Group Inc", atr: 0.18, atrPercent: 7.3, avgVolume: 42500000 },
      { symbol: "RIVN", name: "Rivian Automotive", atr: 0.85, atrPercent: 6.6, avgVolume: 28500000 },
      { symbol: "LAZR", name: "Luminar Technologies", atr: 0.45, atrPercent: 7.7, avgVolume: 8500000 },
      { symbol: "GOEV", name: "Canoo Inc", atr: 0.15, atrPercent: 10.3, avgVolume: 4500000 },
      { symbol: "NKLA", name: "Nikola Corporation", atr: 0.18, atrPercent: 9.7, avgVolume: 22500000 },
      { symbol: "WKHS", name: "Workhorse Group", atr: 0.12, atrPercent: 9.6, avgVolume: 5800000 },
      { symbol: "PRTS", name: "CarParts.com Inc", atr: 0.15, atrPercent: 8.1, avgVolume: 2200000 },
      { symbol: "NIU", name: "Niu Technologies", atr: 0.18, atrPercent: 7.3, avgVolume: 1800000 },
      { symbol: "FUV", name: "Arcimoto Inc", atr: 0.12, atrPercent: 9.6, avgVolume: 850000 },
      { symbol: "SOLO", name: "Electrameccanica", atr: 0.12, atrPercent: 8.3, avgVolume: 1200000 },
    ],
  },
  {
    name: "Telecom",
    stocks: [
      { symbol: "LUMN", name: "Lumen Technologies", atr: 0.45, atrPercent: 7.7, avgVolume: 28500000 },
      { symbol: "DISH", name: "DISH Network Corp", atr: 0.42, atrPercent: 7.7, avgVolume: 8500000 },
      { symbol: "USM", name: "US Cellular Corp", atr: 0.95, atrPercent: 3.3, avgVolume: 850000 },
      { symbol: "GOGO", name: "Gogo Inc", atr: 0.42, atrPercent: 4.7, avgVolume: 1200000 },
      { symbol: "SATS", name: "EchoStar Corporation", atr: 1.15, atrPercent: 5.1, avgVolume: 2800000 },
      { symbol: "GSAT", name: "Globalstar Inc", atr: 0.12, atrPercent: 6.5, avgVolume: 18500000 },
      { symbol: "VSAT", name: "Viasat Inc", atr: 0.72, atrPercent: 5.6, avgVolume: 2200000 },
      { symbol: "COMM", name: "CommScope Holding", atr: 0.32, atrPercent: 6.6, avgVolume: 3500000 },
      { symbol: "CASA", name: "Casa Systems Inc", atr: 0.12, atrPercent: 8.3, avgVolume: 1800000 },
      { symbol: "VIAV", name: "Viavi Solutions", atr: 0.38, atrPercent: 4.5, avgVolume: 2500000 },
    ],
  },
  {
    name: "Transports",
    stocks: [
      { symbol: "ZIM", name: "ZIM Integrated Ship", atr: 1.25, atrPercent: 6.6, avgVolume: 4500000 },
      { symbol: "GXO", name: "GXO Logistics Inc", atr: 1.15, atrPercent: 4.0, avgVolume: 1800000 },
      { symbol: "SNDR", name: "Schneider National", atr: 0.72, atrPercent: 3.2, avgVolume: 1500000 },
      { symbol: "WERN", name: "Werner Enterprises", atr: 0.85, atrPercent: 2.9, avgVolume: 850000 },
      { symbol: "KNX", name: "Knight-Swift Transport", atr: 0.92, atrPercent: 3.2, avgVolume: 1200000 },
      { symbol: "HTLD", name: "Heartland Express", atr: 0.38, atrPercent: 4.3, avgVolume: 850000 },
      { symbol: "MRTN", name: "Marten Transport", atr: 0.52, atrPercent: 3.5, avgVolume: 580000 },
      { symbol: "ARCB", name: "ArcBest Corporation", atr: 1.05, atrPercent: 3.6, avgVolume: 580000 },
      { symbol: "ULH", name: "Universal Logistics", atr: 0.95, atrPercent: 3.3, avgVolume: 520000 },
      { symbol: "CVLG", name: "Covenant Logistics", atr: 0.92, atrPercent: 3.2, avgVolume: 520000 },
    ],
  },
  {
    name: "Healthcare",
    stocks: [
      { symbol: "HIMS", name: "Hims & Hers Health", atr: 1.85, atrPercent: 6.5, avgVolume: 12500000 },
      { symbol: "TDOC", name: "Teladoc Health Inc", atr: 0.52, atrPercent: 5.9, avgVolume: 8500000 },
      { symbol: "DOCS", name: "Doximity Inc", atr: 1.45, atrPercent: 5.0, avgVolume: 2800000 },
      { symbol: "GDRX", name: "GoodRx Holdings", atr: 0.32, atrPercent: 5.5, avgVolume: 4500000 },
      { symbol: "OSCR", name: "Oscar Health Inc", atr: 0.85, atrPercent: 5.7, avgVolume: 2200000 },
      { symbol: "CLOV", name: "Clover Health Invest", atr: 0.18, atrPercent: 6.3, avgVolume: 8500000 },
      { symbol: "PGNY", name: "Progyny Inc", atr: 0.95, atrPercent: 5.1, avgVolume: 1500000 },
      { symbol: "PHR", name: "Phreesia Inc", atr: 1.05, atrPercent: 4.7, avgVolume: 850000 },
      { symbol: "ACCD", name: "Accolade Inc", atr: 0.28, atrPercent: 5.8, avgVolume: 1200000 },
      { symbol: "TALK", name: "Talkspace Inc", atr: 0.18, atrPercent: 7.3, avgVolume: 850000 },
    ],
  },
  {
    name: "Semiconductors",
    stocks: [
      { symbol: "INTC", name: "Intel Corporation", atr: 0.95, atrPercent: 5.0, avgVolume: 85000000 },
      { symbol: "WOLF", name: "Wolfspeed Inc", atr: 0.72, atrPercent: 8.5, avgVolume: 12500000 },
      { symbol: "SWKS", name: "Skyworks Solutions", atr: 1.25, atrPercent: 4.3, avgVolume: 3500000 },
      { symbol: "QRVO", name: "Qorvo Inc", atr: 1.35, atrPercent: 4.7, avgVolume: 2800000 },
      { symbol: "DIOD", name: "Diodes Incorporated", atr: 1.15, atrPercent: 4.0, avgVolume: 850000 },
      { symbol: "CRUS", name: "Cirrus Logic Inc", atr: 1.25, atrPercent: 4.4, avgVolume: 1200000 },
      { symbol: "AMBA", name: "Ambarella Inc", atr: 1.85, atrPercent: 6.4, avgVolume: 850000 },
      { symbol: "AOSL", name: "Alpha and Omega Semi", atr: 1.45, atrPercent: 5.1, avgVolume: 580000 },
      { symbol: "NVTS", name: "Navitas Semiconductor", atr: 0.28, atrPercent: 7.3, avgVolume: 2800000 },
      { symbol: "SIMO", name: "Silicon Motion Tech", atr: 1.35, atrPercent: 4.7, avgVolume: 580000 },
    ],
  },
  {
    name: "Cyber Security",
    stocks: [
      { symbol: "S", name: "SentinelOne Inc", atr: 1.35, atrPercent: 5.9, avgVolume: 5800000 },
      { symbol: "TENB", name: "Tenable Holdings", atr: 1.15, atrPercent: 4.0, avgVolume: 1800000 },
      { symbol: "RPD", name: "Rapid7 Inc", atr: 1.45, atrPercent: 5.0, avgVolume: 1200000 },
      { symbol: "VRNS", name: "Varonis Systems", atr: 1.35, atrPercent: 4.7, avgVolume: 850000 },
      { symbol: "RDWR", name: "Radware Ltd", atr: 0.95, atrPercent: 4.2, avgVolume: 520000 },
      { symbol: "BB", name: "BlackBerry Limited", atr: 0.18, atrPercent: 4.7, avgVolume: 8500000 },
      { symbol: "OSPN", name: "OneSpan Inc", atr: 0.52, atrPercent: 4.2, avgVolume: 580000 },
      { symbol: "PING", name: "Ping Identity Holding", atr: 0.95, atrPercent: 3.3, avgVolume: 520000 },
      { symbol: "IDCC", name: "InterDigital Inc", atr: 1.25, atrPercent: 4.3, avgVolume: 580000 },
      { symbol: "VRY", name: "Veritone Inc", atr: 0.22, atrPercent: 9.0, avgVolume: 1200000 },
    ],
  },
  {
    name: "Solar",
    stocks: [
      { symbol: "SEDG", name: "SolarEdge Technologies", atr: 1.25, atrPercent: 8.4, avgVolume: 4500000 },
      { symbol: "RUN", name: "Sunrun Inc", atr: 0.72, atrPercent: 8.1, avgVolume: 8500000 },
      { symbol: "NOVA", name: "Sunnova Energy Intl", atr: 0.45, atrPercent: 9.3, avgVolume: 5800000 },
      { symbol: "ARRY", name: "Array Technologies", atr: 0.42, atrPercent: 7.2, avgVolume: 4500000 },
      { symbol: "CSIQ", name: "Canadian Solar Inc", atr: 0.72, atrPercent: 5.8, avgVolume: 2800000 },
      { symbol: "JKS", name: "JinkoSolar Holding", atr: 1.05, atrPercent: 5.6, avgVolume: 1800000 },
      { symbol: "DQ", name: "Daqo New Energy Corp", atr: 1.15, atrPercent: 6.2, avgVolume: 1500000 },
      { symbol: "SHLS", name: "Shoals Technologies", atr: 0.32, atrPercent: 6.6, avgVolume: 2800000 },
      { symbol: "MAXN", name: "Maxeon Solar Tech", atr: 0.28, atrPercent: 11.4, avgVolume: 2200000 },
      { symbol: "SOL", name: "ReneSola Ltd", atr: 0.22, atrPercent: 7.7, avgVolume: 1200000 },
    ],
  },
  {
    name: "Robotics & Autom.",
    stocks: [
      { symbol: "IRBT", name: "iRobot Corporation", atr: 0.72, atrPercent: 8.5, avgVolume: 2800000 },
      { symbol: "PATH", name: "UiPath Inc", atr: 0.72, atrPercent: 5.6, avgVolume: 8500000 },
      { symbol: "OUST", name: "Ouster Inc", atr: 0.65, atrPercent: 7.3, avgVolume: 2200000 },
      { symbol: "INVZ", name: "Innoviz Technologies", atr: 0.25, atrPercent: 8.8, avgVolume: 1800000 },
      { symbol: "AEVA", name: "Aeva Technologies", atr: 0.38, atrPercent: 7.8, avgVolume: 1500000 },
      { symbol: "CGNX", name: "Cognex Corporation", atr: 1.15, atrPercent: 4.0, avgVolume: 1200000 },
      { symbol: "BRKS", name: "Brooks Automation", atr: 1.25, atrPercent: 4.4, avgVolume: 850000 },
      { symbol: "NOVT", name: "Novanta Inc", atr: 1.35, atrPercent: 4.7, avgVolume: 520000 },
      { symbol: "PRCT", name: "PROCEPT BioRobotics", atr: 1.85, atrPercent: 6.5, avgVolume: 850000 },
      { symbol: "ROBO", name: "ROBO Global Robotics", atr: 0.85, atrPercent: 2.9, avgVolume: 520000 },
    ],
  },
  {
    name: "Leisure & Ent.",
    stocks: [
      { symbol: "DKNG", name: "DraftKings Inc", atr: 1.55, atrPercent: 5.4, avgVolume: 12500000 },
      { symbol: "PENN", name: "Penn Entertainment", atr: 0.95, atrPercent: 5.1, avgVolume: 5800000 },
      { symbol: "RRR", name: "Red Rock Resorts", atr: 1.15, atrPercent: 4.0, avgVolume: 1500000 },
      { symbol: "GDEN", name: "Golden Entertainment", atr: 1.05, atrPercent: 3.7, avgVolume: 580000 },
      { symbol: "BALY", name: "Bally's Corporation", atr: 0.72, atrPercent: 5.6, avgVolume: 850000 },
      { symbol: "AGS", name: "PlayAGS Inc", atr: 0.45, atrPercent: 5.1, avgVolume: 580000 },
      { symbol: "EVRI", name: "Everi Holdings Inc", atr: 0.42, atrPercent: 5.0, avgVolume: 1200000 },
      { symbol: "RSI", name: "Rush Street Interact", atr: 0.52, atrPercent: 5.9, avgVolume: 1800000 },
      { symbol: "SRAD", name: "Sportradar Group", atr: 0.58, atrPercent: 4.5, avgVolume: 1500000 },
      { symbol: "GAN", name: "GAN Limited", atr: 0.15, atrPercent: 8.1, avgVolume: 850000 },
    ],
  },
  {
    name: "China",
    stocks: [
      { symbol: "NIO", name: "NIO Inc", atr: 0.38, atrPercent: 7.8, avgVolume: 85000000 },
      { symbol: "XPEV", name: "XPeng Inc", atr: 1.45, atrPercent: 7.7, avgVolume: 28500000 },
      { symbol: "LI", name: "Li Auto Inc", atr: 1.35, atrPercent: 6.0, avgVolume: 18500000 },
      { symbol: "BILI", name: "Bilibili Inc", atr: 1.15, atrPercent: 6.2, avgVolume: 8500000 },
      { symbol: "IQ", name: "iQIYI Inc", atr: 0.18, atrPercent: 6.3, avgVolume: 12500000 },
      { symbol: "TAL", name: "TAL Education Group", atr: 0.72, atrPercent: 5.6, avgVolume: 5800000 },
      { symbol: "GOTU", name: "Gaotu Techedu Inc", atr: 0.52, atrPercent: 6.2, avgVolume: 2800000 },
      { symbol: "YMM", name: "Full Truck Alliance", atr: 0.48, atrPercent: 5.4, avgVolume: 4500000 },
      { symbol: "QFIN", name: "360 Finance Inc", atr: 1.25, atrPercent: 4.4, avgVolume: 1800000 },
      { symbol: "FINV", name: "FinVolution Group", atr: 0.42, atrPercent: 4.7, avgVolume: 1500000 },
    ],
  },
  {
    name: "Home Builders",
    stocks: [
      { symbol: "BZH", name: "Beazer Homes USA", atr: 1.25, atrPercent: 4.4, avgVolume: 850000 },
      { symbol: "HOV", name: "Hovnanian Enterprises", atr: 2.15, atrPercent: 7.5, avgVolume: 580000 },
      { symbol: "CCS", name: "Century Communities", atr: 1.35, atrPercent: 4.7, avgVolume: 520000 },
      { symbol: "GRBK", name: "Green Brick Partners", atr: 1.45, atrPercent: 5.0, avgVolume: 580000 },
      { symbol: "SKY", name: "Skyline Champion", atr: 1.25, atrPercent: 4.4, avgVolume: 850000 },
      { symbol: "MHO", name: "M/I Homes Inc", atr: 1.55, atrPercent: 5.4, avgVolume: 520000 },
      { symbol: "DFH", name: "Dream Finders Homes", atr: 1.45, atrPercent: 5.1, avgVolume: 580000 },
      { symbol: "TPH", name: "Tri Pointe Homes", atr: 1.15, atrPercent: 4.0, avgVolume: 1200000 },
      { symbol: "LEGH", name: "Legacy Housing Corp", atr: 0.95, atrPercent: 4.2, avgVolume: 520000 },
      { symbol: "UHG", name: "United Homes Group", atr: 0.52, atrPercent: 5.9, avgVolume: 520000 },
    ],
  },
  {
    name: "Internet",
    stocks: [
      { symbol: "SNAP", name: "Snap Inc", atr: 0.72, atrPercent: 5.6, avgVolume: 28500000 },
      { symbol: "PINS", name: "Pinterest Inc", atr: 1.25, atrPercent: 4.3, avgVolume: 8500000 },
      { symbol: "BMBL", name: "Bumble Inc", atr: 0.38, atrPercent: 6.5, avgVolume: 4500000 },
      { symbol: "YELP", name: "Yelp Inc", atr: 1.15, atrPercent: 4.0, avgVolume: 850000 },
      { symbol: "ANGI", name: "Angi Inc", atr: 0.12, atrPercent: 6.5, avgVolume: 2800000 },
      { symbol: "CARG", name: "CarGurus Inc", atr: 1.25, atrPercent: 4.4, avgVolume: 1200000 },
      { symbol: "CARS", name: "Cars.com Inc", atr: 0.72, atrPercent: 4.8, avgVolume: 850000 },
      { symbol: "W", name: "Wayfair Inc", atr: 1.85, atrPercent: 6.4, avgVolume: 4500000 },
      { symbol: "FVRR", name: "Fiverr International", atr: 1.25, atrPercent: 5.6, avgVolume: 1500000 },
      { symbol: "UPWK", name: "Upwork Inc", atr: 0.72, atrPercent: 5.6, avgVolume: 1800000 },
    ],
  },
  {
    name: "Software",
    stocks: [
      { symbol: "U", name: "Unity Software Inc", atr: 1.45, atrPercent: 6.3, avgVolume: 8500000 },
      { symbol: "ZI", name: "ZoomInfo Technologies", atr: 0.52, atrPercent: 5.9, avgVolume: 5800000 },
      { symbol: "FROG", name: "JFrog Ltd", atr: 1.45, atrPercent: 5.1, avgVolume: 1200000 },
      { symbol: "DOCN", name: "DigitalOcean Holdings", atr: 1.55, atrPercent: 5.4, avgVolume: 1800000 },
      { symbol: "ZEN", name: "Zendesk Inc", atr: 1.25, atrPercent: 4.4, avgVolume: 850000 },
      { symbol: "OKTA", name: "Okta Inc", atr: 1.65, atrPercent: 5.7, avgVolume: 2800000 },
      { symbol: "ZM", name: "Zoom Video Comms", atr: 1.35, atrPercent: 4.7, avgVolume: 4500000 },
      { symbol: "DOCU", name: "DocuSign Inc", atr: 1.45, atrPercent: 5.0, avgVolume: 3500000 },
      { symbol: "ESTC", name: "Elastic N.V.", atr: 1.55, atrPercent: 5.4, avgVolume: 1500000 },
      { symbol: "MDB", name: "MongoDB Inc", atr: 2.15, atrPercent: 7.5, avgVolume: 2200000 },
    ],
  },
  {
    name: "Cannabis",
    stocks: [
      { symbol: "TLRY", name: "Tilray Brands Inc", atr: 0.12, atrPercent: 8.3, avgVolume: 42500000 },
      { symbol: "CGC", name: "Canopy Growth Corp", atr: 0.28, atrPercent: 9.8, avgVolume: 12500000 },
      { symbol: "ACB", name: "Aurora Cannabis Inc", atr: 0.38, atrPercent: 7.8, avgVolume: 5800000 },
      { symbol: "SNDL", name: "SNDL Inc", atr: 0.12, atrPercent: 6.5, avgVolume: 28500000 },
      { symbol: "CRON", name: "Cronos Group Inc", atr: 0.15, atrPercent: 6.1, avgVolume: 4500000 },
      { symbol: "OGI", name: "Organigram Holdings", atr: 0.08, atrPercent: 6.4, avgVolume: 2800000 },
      { symbol: "VFF", name: "Village Farms Intl", atr: 0.12, atrPercent: 8.3, avgVolume: 1800000 },
      { symbol: "GRWG", name: "GrowGeneration Corp", atr: 0.22, atrPercent: 7.7, avgVolume: 2200000 },
      { symbol: "CURLF", name: "Curaleaf Holdings", atr: 0.18, atrPercent: 7.3, avgVolume: 1500000 },
      { symbol: "TCNNF", name: "Trulieve Cannabis", atr: 0.52, atrPercent: 5.9, avgVolume: 850000 },
    ],
  },
];

// Get all unique day trade stock symbols
export const getAllDayTradeSymbols = (): string[] => {
  const symbols = new Set<string>();
  DAYTRADE_INDUSTRIES.forEach(industry => {
    industry.stocks.forEach(stock => symbols.add(stock.symbol));
  });
  return Array.from(symbols);
};

// Get stock data by symbol (for ATR lookup)
export const getDayTradeStockData = (symbol: string): DayTradeStockData | undefined => {
  for (const industry of DAYTRADE_INDUSTRIES) {
    const stock = industry.stocks.find(s => s.symbol === symbol);
    if (stock) return stock;
  }
  return undefined;
};


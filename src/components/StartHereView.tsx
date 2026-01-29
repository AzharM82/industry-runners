import { useState } from 'react';
import {
  Rocket, PiggyBank, PlayCircle, BookOpen, Brain, BarChart3, Target,
  TrendingUp, Activity, Briefcase, ChevronDown, ChevronRight,
  ExternalLink, Clock, Youtube
} from 'lucide-react';

interface StartHereViewProps {
  onNavigateToTab: (tab: string) => void;
}

interface VideoChannel {
  name: string;
  url: string;
  description: string;
  duration: string;
}

interface VideoCategory {
  id: string;
  title: string;
  subtitle?: string;
  channels: VideoChannel[];
}

const videoCategories: VideoCategory[] = [
  {
    id: 'getting-started',
    title: '1. Getting Started in the Stock Market',
    channels: [
      { name: 'Charles Schwab', url: 'https://www.youtube.com/@CharlesSchwab', description: 'Professional broker education. Clear explanations on stocks & investing basics.', duration: '3-5 min' },
      { name: 'Mark Tilbury', url: 'https://www.youtube.com/@MarkTilbury', description: '1.8M+ subs. Self-made millionaire sharing practical beginner tips.', duration: '5-8 min' },
      { name: 'WhiteBoard Finance', url: 'https://www.youtube.com/@WhiteBoardFinance', description: 'Visual whiteboard explanations. Great for visual learners.', duration: '7-10 min' },
      { name: "Let's Talk Money!", url: 'https://www.youtube.com/@JosephHogueCFA', description: 'CFA-certified educator with credible, straightforward content.', duration: '6-10 min' },
      { name: 'Andrei Jikh', url: 'https://www.youtube.com/@AndreiJikh', description: 'Engaging content on investing basics and personal finance.', duration: '8-10 min' },
    ]
  },
  {
    id: 'read-charts',
    title: '2. How to Read a Stock Chart',
    channels: [
      { name: 'TD Ameritrade', url: 'https://www.youtube.com/@TDAmeritrade', description: 'Technical analysis playlist: line charts, candlesticks, support/resistance.', duration: '3-8 min' },
      { name: 'The Trading Channel', url: 'https://www.youtube.com/@TheTradingChannel', description: "Stephen Hart's beginner-friendly chart pattern videos.", duration: '5-10 min' },
      { name: 'Wysetrade', url: 'https://www.youtube.com/@Wysetrade', description: 'Simplifies difficult chart reading concepts. High-quality videos.', duration: '6-10 min' },
      { name: 'ClayTrader', url: 'https://www.youtube.com/@ClayTrader', description: 'Day trading education: tickers, timeframes, moving averages.', duration: '5-8 min' },
      { name: 'Charting Wealth', url: 'https://www.youtube.com/@ChartingWealth', description: 'Daily market updates with chart analysis. Short, focused videos.', duration: '3-5 min' },
    ]
  },
  {
    id: 'fundamentals',
    title: '3. Stock Fundamentals',
    channels: [
      { name: 'Charles Schwab', url: 'https://www.youtube.com/@CharlesSchwab', description: 'P/E ratios, earnings estimates, reading financial statements.', duration: '4-6 min' },
      { name: 'The Plain Bagel', url: 'https://www.youtube.com/@ThePlainBagel', description: 'Richard Coffin CFA/CFP breaks down fundamentals with humor.', duration: '8-10 min' },
      { name: 'Zerodha Varsity', url: 'https://www.youtube.com/@ZerodhaVarsity', description: 'Comprehensive modules on fundamental analysis for beginners.', duration: '5-10 min' },
      { name: 'Pranjal Kamra', url: 'https://www.youtube.com/@PranjalKamra', description: '6M+ subs. Simplifies value investing and fundamentals.', duration: '8-10 min' },
      { name: 'Ticker Symbol: YOU', url: 'https://www.youtube.com/@TickerSymbolYou', description: 'Succinct deep dives into company fundamentals. No fluff.', duration: '6-10 min' },
    ]
  },
  {
    id: 'orders',
    title: '4. Placing Various Stock Orders',
    subtitle: 'Market Orders, Limit Orders, Stop Orders',
    channels: [
      { name: 'TD Ameritrade', url: 'https://www.youtube.com/@TDAmeritrade', description: 'Official broker content: market, limit, and stop orders explained.', duration: '3-5 min' },
      { name: 'Mind Math Money', url: 'https://www.youtube.com/@MindMathMoney', description: 'Buy/sell limit and stop orders. Clear, beginner-friendly format.', duration: '5-8 min' },
      { name: 'TradingLab', url: 'https://www.youtube.com/@TradingLab', description: 'High-quality videos explaining order execution strategies.', duration: '6-10 min' },
      { name: 'Warrior Trading', url: 'https://www.youtube.com/@WarriorTrading', description: 'Platform walkthroughs for placing different order types.', duration: '5-8 min' },
      { name: 'Financial Education', url: 'https://www.youtube.com/@FinancialEducation', description: '721K+ subs. Practical advice on placing orders effectively.', duration: '7-10 min' },
    ]
  },
  {
    id: 'tracking',
    title: '5. Tracking Your Performance',
    subtitle: 'Trading Journals & Portfolio Tracking',
    channels: [
      { name: 'TraderSync', url: 'https://www.youtube.com/@TraderSync', description: 'Leading journal platform tutorials: tracking trades, finding edge.', duration: '5-10 min' },
      { name: 'Timothy Sykes', url: 'https://www.youtube.com/@TimothySykes', description: 'Why journaling matters. Track entry/exit points, stop losses.', duration: '6-10 min' },
      { name: 'TradesViz', url: 'https://www.youtube.com/@TradesViz', description: '600+ statistics and metrics for analyzing trading performance.', duration: '5-8 min' },
      { name: 'Damien Talks Money', url: 'https://www.youtube.com/@DamienTalksMoney', description: 'Portfolio diversification and risk management tracking.', duration: '8-10 min' },
    ]
  },
];

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: string[];
}

const guideSections: GuideSection[] = [
  {
    id: 'ai-analysis',
    title: 'AI Analysis',
    icon: <Brain className="w-5 h-5 text-purple-400" />,
    content: [
      'The AI Analysis tab provides AI-powered insights for your stock research and trading decisions.',
      'Upload a stock chart image or enter a ticker symbol to get comprehensive AI analysis including technical patterns, support/resistance levels, and trading recommendations.',
      'Choose from multiple analysis types: ChartGPT for technical analysis, Deep Research for comprehensive fundamental research, and Halal Check for Shariah compliance screening.',
      'Each user gets a limited number of AI prompts per month based on their subscription. Beta users receive 3 free prompts per analysis type to test the features.',
    ]
  },
  {
    id: 'analysis',
    title: 'Stock Analysis',
    icon: <BarChart3 className="w-5 h-5 text-blue-400" />,
    content: [
      'The Stock Analysis tab displays detailed fundamental data for any stock you search.',
      'View real-time price data, key ratios (P/E, P/B, P/S, ROE, ROA), and financial statements (Income, Balance Sheet, Cash Flow).',
      'The analysis includes company information, sector classification, and dividend history.',
      'Use this section to research stocks before making investment decisions.',
    ]
  },
  {
    id: 'focus',
    title: 'Focus Stocks',
    icon: <Target className="w-5 h-5 text-yellow-400" />,
    content: [
      'Focus Stocks is a curated list of 250+ high-potential stocks that deserve special attention.',
      'These stocks are selected based on criteria like strong relative strength, breaking out of consolidation patterns, or showing unusual volume activity.',
      'Each stock displays key metrics including current price, daily change, and volume information.',
      'Use this section as your starting point each trading day to identify opportunities.',
    ]
  },
  {
    id: 'breadth',
    title: 'Market Breadth',
    icon: <Activity className="w-5 h-5 text-green-400" />,
    content: [
      'The Market Breadth dashboard shows the overall health of the market by analyzing participation across thousands of stocks.',
      'The Market Condition indicator gives you a clear signal: "ALL IN" (bullish), "STAY 50%" (neutral), or "GET OUT" (bearish).',
      'Key metrics include: T2108, stocks up/down 4%+ today, 5-day and 10-day rolling ratios, new highs vs lows, and SMA analysis.',
      'Check Market Breadth first each morning to gauge overall market health before trading.',
    ]
  },
  {
    id: 'swing',
    title: 'Swing Trading',
    icon: <TrendingUp className="w-5 h-5 text-cyan-400" />,
    content: [
      'The Swing Trading section shows 20 sector ETFs with their top holdings and relative strength.',
      'Each ETF card displays the ETF price, median change from open, and how each holding is performing relative to the ETF.',
      'Use this to identify which sectors are leading and find the strongest stocks within those sectors.',
      'Swing trading focuses on holding positions for several days to weeks to capture larger moves.',
    ]
  },
  {
    id: 'daytrade',
    title: 'Day Trading',
    icon: <Briefcase className="w-5 h-5 text-orange-400" />,
    content: [
      'The Day Trading section lists 50 high-volatility stocks across 5 industries: Crypto, Gold Miners, Metals, Defense, and Energy.',
      'Each stock shows ATR (Average True Range), ATR%, current price, volume, and change from open.',
      'These stocks have sufficient volatility and liquidity for intraday trading.',
      'Day trading requires strict risk management - never risk more than 1-2% of your account on any single trade.',
    ]
  },
  {
    id: 'trade-management',
    title: 'Trade Management',
    icon: <Briefcase className="w-5 h-5 text-red-400" />,
    content: [
      'Trade Management is your command center for tracking active positions and calculating real-time P&L.',
      'Enter your entry price, shares, and track your unrealized gains/losses as prices update.',
      'Track multiple positions simultaneously and see your total daily P&L across all trades.',
      'Essential for maintaining discipline and avoiding emotional decision-making during active trading.',
    ]
  },
  {
    id: 'investment',
    title: 'Long Term Investment',
    icon: <PiggyBank className="w-5 h-5 text-emerald-400" />,
    content: [
      'A disciplined 3-year investment strategy: add 1 new stock per quarter, invest up to $10,000 per stock.',
      'Investment System tab explains the complete strategy and rules.',
      'Investment Execution tab shows your portfolio with live prices and P&L calculations.',
      'Investment Summary tab displays a visual calendar of your investment activity.',
    ]
  },
];

export function StartHereView({ onNavigateToTab }: StartHereViewProps) {
  const [expandedVideo, setExpandedVideo] = useState<string | null>('getting-started');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-xl p-8 border border-blue-700/50">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-600/30 rounded-xl">
            <Rocket className="w-8 h-8 text-blue-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-3">Welcome to StockPro AI</h1>
            <p className="text-gray-300 text-lg leading-relaxed mb-4">
              Your comprehensive stock market analysis platform with AI-powered insights, real-time market data,
              and tools for both active trading and long-term investing.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">AI Analysis</div>
                <div className="text-sm text-gray-400">ChartGPT, Deep Research, Halal Screening</div>
              </div>
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">Market Intelligence</div>
                <div className="text-sm text-gray-400">Breadth, Sector Rotation, Focus Stocks</div>
              </div>
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-400">Trading Tools</div>
                <div className="text-sm text-gray-400">Swing, Day Trade, Trade Management</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Long Term Portfolio Highlight */}
      <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 rounded-xl p-6 border border-emerald-700/50">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-600/30 rounded-xl">
            <PiggyBank className="w-8 h-8 text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-white">Long Term Portfolio</h2>
              <span className="px-2 py-1 bg-emerald-600/30 text-emerald-300 text-xs font-medium rounded">RECOMMENDED</span>
            </div>
            <p className="text-gray-300 leading-relaxed mb-4">
              Build lasting wealth with our disciplined 3-year investment strategy. Add <strong>1 high-conviction stock per quarter</strong>,
              invest up to <strong>$10,000 per position</strong>, and let compounding work its magic. By December 2028,
              you'll have a concentrated portfolio of <strong>12 carefully selected stocks</strong> with a total investment of <strong>$120,000</strong>.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">12</div>
                <div className="text-xs text-gray-400">Stocks Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">$10K</div>
                <div className="text-xs text-gray-400">Max Per Stock</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">3 Years</div>
                <div className="text-xs text-gray-400">Investment Period</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">$120K</div>
                <div className="text-xs text-gray-400">Total Investment</div>
              </div>
            </div>
            <button
              onClick={() => onNavigateToTab('investment')}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition flex items-center gap-2"
            >
              <PiggyBank className="w-5 h-5" />
              Go to Long Term Investment
            </button>
          </div>
        </div>
      </div>

      {/* Beginner Video Series */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600/20 rounded-lg">
              <Youtube className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Beginner Stock Trading Videos</h2>
              <p className="text-sm text-gray-400">Curated educational videos under 10 minutes each</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {videoCategories.map((category) => (
            <div key={category.id} className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedVideo(expandedVideo === category.id ? null : category.id)}
                className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-700/50 transition"
              >
                <div>
                  <span className="font-medium text-white">{category.title}</span>
                  {category.subtitle && (
                    <span className="text-sm text-gray-400 ml-2">({category.subtitle})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{category.channels.length} channels</span>
                  {expandedVideo === category.id ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {expandedVideo === category.id && (
                <div className="p-4 bg-gray-800/50 border-t border-gray-700">
                  <div className="grid gap-3">
                    {category.channels.map((channel, idx) => (
                      <a
                        key={idx}
                        href={channel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-4 p-3 bg-gray-900/50 hover:bg-gray-700/50 rounded-lg transition group"
                      >
                        <div className="p-2 bg-red-600/20 rounded-lg flex-shrink-0">
                          <PlayCircle className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white group-hover:text-red-400 transition">{channel.name}</span>
                            <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-red-400 transition" />
                          </div>
                          <p className="text-sm text-gray-400 mt-1">{channel.description}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {channel.duration}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feature Guide */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Feature Guide</h2>
              <p className="text-sm text-gray-400">Learn how to use each section of StockPro AI</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {guideSections.map((section) => (
            <div key={section.id} className="border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedGuide(expandedGuide === section.id ? null : section.id)}
                className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-3">
                  {section.icon}
                  <span className="font-medium text-white">{section.title}</span>
                </div>
                {expandedGuide === section.id ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedGuide === section.id && (
                <div className="p-4 bg-gray-800/50 border-t border-gray-700">
                  <ul className="space-y-3">
                    {section.content.map((paragraph, idx) => (
                      <li key={idx} className="flex gap-3 text-gray-300 text-sm leading-relaxed">
                        <span className="text-blue-400 font-bold mt-0.5">•</span>
                        <span>{paragraph}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* General Tips */}
        <div className="p-4 border-t border-gray-700">
          <div className="p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-700/50">
            <h3 className="font-semibold text-white mb-3">General Tips</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Check Market Breadth first each morning to gauge overall market health before trading.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Use AI Analysis sparingly for high-conviction ideas to maximize your monthly prompt allowance.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Combine Focus Stocks with Breadth data - strong stocks in a strong market have the best odds.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Use Trade Management to track positions and maintain discipline during active trading.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Start with Long Term Investment for wealth building - it's the foundation of financial success.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, BookOpen, Brain, BarChart3, Target, TrendingUp, Activity, Briefcase, PiggyBank, ChevronDown, ChevronRight } from 'lucide-react';

interface UsageGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: string[];
}

const guideSections: GuideSection[] = [
  {
    id: 'ai-analysis',
    title: 'Smart Stock Analysis (AI)',
    icon: <Brain className="w-5 h-5 text-purple-400" />,
    content: [
      'The Smart Stock Analysis tab provides AI-powered insights for your stock research and trading decisions.',
      'Upload a stock chart image or enter a ticker symbol to get comprehensive AI analysis including technical patterns, support/resistance levels, and trading recommendations.',
      'Choose from multiple analysis types: Quick Analysis for fast insights, Deep Dive for comprehensive research, Entry/Exit Points for trade planning, and Risk Assessment for position sizing.',
      'Each user gets a limited number of AI prompts per month based on their subscription. Beta users receive 3 free prompts per analysis type to test the features.',
      'The AI considers multiple factors including price action, volume patterns, market conditions, and historical performance to provide actionable insights.',
      'Pro tip: For best results, upload clear chart images with visible candlesticks, volume bars, and any indicators you want the AI to analyze.',
    ]
  },
  {
    id: 'analysis',
    title: 'Stock Analysis',
    icon: <BarChart3 className="w-5 h-5 text-blue-400" />,
    content: [
      'The Stock Analysis tab displays detailed technical and fundamental data for individual stocks in your watchlist.',
      'View real-time price data, percentage changes, volume information, and key metrics like P/E ratio, market cap, and 52-week highs/lows.',
      'The analysis includes relative strength indicators showing how stocks are performing compared to the broader market and their sector.',
      'Use the search and filter functionality to quickly find specific stocks or sort by various metrics like price change, volume, or market cap.',
      'Color-coded indicators help you quickly identify bullish (green) and bearish (red) signals across different timeframes.',
      'This section is perfect for building and monitoring your watchlist of potential trading candidates.',
    ]
  },
  {
    id: 'focus',
    title: 'Focus Stocks',
    icon: <Target className="w-5 h-5 text-yellow-400" />,
    content: [
      'Focus Stocks is a curated list of high-potential stocks that deserve special attention based on technical setups and momentum.',
      'These stocks are selected based on criteria like strong relative strength, breaking out of consolidation patterns, or showing unusual volume activity.',
      'The list is organized by sectors and themes, helping you identify which areas of the market are showing leadership.',
      'Each stock displays key metrics including current price, daily change, volume compared to average, and distance from key moving averages.',
      'Use this section as your starting point each trading day to identify the best opportunities before the market opens.',
      'Focus stocks are regularly updated to reflect changing market conditions and emerging opportunities.',
    ]
  },
  {
    id: 'breadth',
    title: 'Market Breadth',
    icon: <Activity className="w-5 h-5 text-green-400" />,
    content: [
      'The Market Breadth dashboard shows the overall health of the market by analyzing participation across hundreds of stocks.',
      'The Market Condition indicator at the top gives you a clear signal: "ALL IN" (bullish), "STAY 50%" (neutral/cautious), or "GET OUT" (bearish) based on multiple breadth factors.',
      'Key metrics include: stocks up/down 4%+ today, 5-day and 10-day rolling ratios, quarterly performers, and T2108 (percentage of stocks above their 40-day moving average).',
      'The Finviz data section shows new highs vs new lows, stocks above/below key moving averages (20, 50, 200 SMA), and advance/decline ratios.',
      'Use breadth indicators to confirm or question the overall market trend. Strong breadth supports bullish positions, while deteriorating breadth warns of potential weakness.',
      'During non-market hours, cached data is displayed to provide fast loading times. Live data refreshes automatically during trading hours.',
      'The scoring system weighs multiple factors to give you an objective market condition reading, removing emotional bias from your analysis.',
    ]
  },
  {
    id: 'swing',
    title: 'Swing Trade',
    icon: <TrendingUp className="w-5 h-5 text-cyan-400" />,
    content: [
      'The Swing Trade section focuses on stocks suitable for holding positions for several days to weeks, capturing larger price moves.',
      'Stocks here are selected based on criteria favorable for swing trading: strong trends, clear support/resistance levels, and manageable volatility.',
      'The data includes technical indicators relevant for swing traders like RSI, MACD signals, and distance from key moving averages.',
      'Position sizing suggestions help you manage risk by showing appropriate share quantities based on stop-loss levels.',
      'Use the sector breakdown to ensure you are diversified and not overexposed to any single industry.',
      'Swing trading requires patience and discipline. Use the data here to plan entries at support and exits at resistance levels.',
    ]
  },
  {
    id: 'daytrade',
    title: 'Day Trade',
    icon: <Briefcase className="w-5 h-5 text-orange-400" />,
    content: [
      'The Day Trade section lists stocks ideal for intraday trading with high liquidity, volatility, and clear price action.',
      'These stocks typically have average daily volume over 1 million shares and sufficient price range to capture meaningful moves within a single session.',
      'The list includes ETFs across sectors (SMH, XLE, XLF, etc.) and high-beta individual stocks that respond well to market movements.',
      'Real-time data shows premarket activity, gap percentages, and relative volume to help you identify the most active names each day.',
      'Day trading requires strict risk management. Never risk more than 1-2% of your account on any single trade.',
      'Use the Trade Management tab alongside this section to track your intraday positions and P&L in real-time.',
    ]
  },
  {
    id: 'trade-management',
    title: 'Trade Management',
    icon: <Briefcase className="w-5 h-5 text-red-400" />,
    content: [
      'Trade Management is your command center for tracking active day trading positions and calculating real-time profit/loss.',
      'Enter your entry price, number of shares, and current price to see your unrealized P&L update in real-time.',
      'The position sizing calculator helps you determine the right number of shares based on your account size and risk tolerance.',
      'Track multiple positions simultaneously and see your total daily P&L across all trades.',
      'Use the notes field to record your trade thesis, entry triggers, and lessons learned for future reference.',
      'This tool is essential for maintaining discipline and avoiding emotional decision-making during active trading sessions.',
    ]
  },
  {
    id: 'investment',
    title: 'Long Term Investment',
    icon: <PiggyBank className="w-5 h-5 text-emerald-400" />,
    content: [
      'The Long Term Investment section implements a disciplined 3-year investment strategy focused on building a concentrated portfolio of 12 high-conviction stocks.',
      'Investment System tab explains the complete strategy: add 1 new stock per quarter, invest up to $10,000 per stock ($5K initial + $5K DCA over remaining months).',
      'Investment Execution tab shows your current portfolio, all buy transactions, and lets you track performance with real-time P&L calculations.',
      'Investment Summary tab displays a visual calendar showing your investment activity month by month, making it easy to track your consistency.',
      'The system enforces rules like one stock per quarter maximum and $10K total limit per position to maintain discipline.',
      'This long-term approach uses dollar-cost averaging to reduce timing risk while building meaningful positions in your highest conviction ideas.',
      'Only administrators can modify the portfolio. Regular users can view the investments in read-only mode to follow along with the strategy.',
    ]
  },
];

export function UsageGuide({ isOpen, onClose }: UsageGuideProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('ai-analysis');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-700">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Usage Guide</h2>
              <p className="text-sm text-gray-400">Learn how to use StockPro AI effectively</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {guideSections.map((section) => (
              <div
                key={section.id}
                className="border border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Section Header */}
                <button
                  onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-700/50 transition"
                >
                  <div className="flex items-center gap-3">
                    {section.icon}
                    <span className="font-medium text-white">{section.title}</span>
                  </div>
                  {expandedSection === section.id ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Section Content */}
                {expandedSection === section.id && (
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

          {/* Tips Section */}
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-700/50">
            <h3 className="font-semibold text-white mb-3">General Tips</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Check Market Breadth first each morning to gauge overall market health before trading.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Use the AI Analysis sparingly for high-conviction ideas to maximize your monthly prompt allowance.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Combine Focus Stocks with Breadth data - strong stocks in a strong market have the best odds.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Always use Trade Management to track positions and maintain discipline during active trading.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">★</span>
                <span>Send feedback via the Feedback button - your input helps improve StockPro AI!</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

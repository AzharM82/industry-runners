const aiFeatures = [
  {
    title: 'ChartGPT',
    description: 'AI-powered pattern recognition with precise entry and exit points. Identifies wedge breaks, pullbacks, and high-probability setups.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    title: 'Deep Research',
    description: '13-point institutional equity research framework. Revenue models, competitive moats, valuation, and catalysts.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Halal Check',
    description: 'AAOIFI-compliant Shariah screening. Debt ratios, business activities, and cross-platform verification.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const marketFeatures = [
  {
    title: 'Stock Analysis',
    description: 'Comprehensive stock lookup with financials, ratios, and key metrics. Everything you need for fundamental analysis.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Focus Stocks',
    description: 'Track your watchlist with real-time data. Volume analysis, price changes, and relative strength at a glance.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    title: 'Breadth Indicators',
    description: 'Market-wide breadth analysis. Track stocks up/down by percentage, quarterly and monthly performance metrics.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'Swing Trading',
    description: 'ETF-based sector analysis with top holdings. Find relative strength leaders across 15+ industry groups.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    title: 'Day Trading',
    description: 'Real-time intraday movers with ATR analysis. Sorted by sector with volume and price action data.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'Real-Time Data',
    description: 'Live market data powered by Polygon.io. Auto-refreshes during market hours to keep you updated.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section className="py-20 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* AI Tools Section */}
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          AI-Powered Analysis
        </h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Three powerful AI tools powered by Claude, delivering institutional-quality insights in seconds.
        </p>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {aiFeatures.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-6">
                {feature.icon}
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>

              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Market Tools Section */}
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Market Analysis Tools
        </h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Professional-grade market data and analysis tools for swing traders and day traders.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {marketFeatures.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-green-200 hover:shadow-lg transition-all"
            >
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-green-600 mb-6">
                {feature.icon}
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>

              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

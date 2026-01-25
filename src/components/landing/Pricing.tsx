interface PricingProps {
  onSubscribe: () => void;
}

export function Pricing({ onSubscribe }: PricingProps) {
  return (
    <section className="py-20 px-6">
      <div className="max-w-xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Simple pricing
        </h2>
        <p className="text-gray-600 text-center mb-12">
          One plan. Everything included.
        </p>

        <div className="bg-white rounded-2xl border-2 border-gray-900 p-8 shadow-xl">
          <div className="text-center mb-8">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-gray-900">$6.99</span>
              <span className="text-gray-600">/month</span>
            </div>
          </div>

          <ul className="space-y-4 mb-8">
            {[
              '30 ChartGPT analyses per month',
              '30 Deep Research reports per month',
              '30 Halal compliance checks per month',
              'Powered by Claude AI (Sonnet)',
              'Results cached for faster access',
              'Cancel anytime',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={onSubscribe}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-xl font-semibold text-lg transition-colors"
          >
            Subscribe Now
          </button>

          <p className="text-center text-sm text-gray-500 mt-4">
            No refunds. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
}

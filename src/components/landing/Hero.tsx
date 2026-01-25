interface HeroProps {
  onGetStarted: () => void;
}

export function Hero({ onGetStarted }: HeroProps) {
  return (
    <section className="pt-32 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Institutional-quality
          <br />
          <span className="text-blue-600">stock analysis.</span>
        </h1>

        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Powered by AI. Ready in seconds.
          <br />
          Get deep research, chart analysis, and compliance checks.
        </p>

        <button
          onClick={onGetStarted}
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
        >
          Get Started
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </button>

        <p className="mt-4 text-sm text-gray-500">
          $6.99/month · Cancel anytime
        </p>
      </div>
    </section>
  );
}

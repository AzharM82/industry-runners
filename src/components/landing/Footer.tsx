export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-gray-600">StockPro AI</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="/terms" className="hover:text-gray-900 transition-colors">
              Terms
            </a>
            <a href="/privacy" className="hover:text-gray-900 transition-colors">
              Privacy
            </a>
            <a href="mailto:support@stockproai.net" className="hover:text-gray-900 transition-colors">
              Contact
            </a>
          </div>

          <p className="text-sm text-gray-400">
            &copy; {currentYear} StockPro AI. All rights reserved.
          </p>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-center text-xs text-gray-500 font-medium mb-2">
            Important Disclaimer
          </p>
          <p className="text-center text-xs text-gray-400 max-w-4xl mx-auto leading-relaxed">
            StockPro AI is an educational and informational tool only. The content provided, including AI-generated
            analysis, market indicators, and trading signals, does <strong>not</strong> constitute financial advice,
            investment advice, tax advice, or legal advice. The creators and operators of StockPro AI are not
            registered investment advisors, certified financial planners, licensed brokers, or CPAs.
          </p>
          <p className="text-center text-xs text-gray-400 max-w-4xl mx-auto leading-relaxed mt-3">
            All investments involve risk, including potential loss of principal. Past performance does not guarantee
            future results. You should consult with a qualified financial professional before making any investment
            decisions. By using this service, you acknowledge that you are solely responsible for your own investment
            decisions and assume all associated risks.
          </p>
        </div>
      </div>
    </footer>
  );
}

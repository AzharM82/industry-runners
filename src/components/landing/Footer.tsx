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

        <p className="text-center text-xs text-gray-400 mt-8 max-w-2xl mx-auto">
          StockPro AI provides AI-generated analysis for informational purposes only.
          This is not financial advice. Always conduct your own research before making investment decisions.
        </p>
      </div>
    </footer>
  );
}

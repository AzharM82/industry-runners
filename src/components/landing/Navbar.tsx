interface NavbarProps {
  onLogin: () => void;
  onSubscribe: () => void;
}

export function Navbar({ onLogin, onSubscribe }: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">StockPro AI</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onLogin}
            className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Login
          </button>
          <button
            onClick={onSubscribe}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Subscribe
          </button>
        </div>
      </div>
    </nav>
  );
}

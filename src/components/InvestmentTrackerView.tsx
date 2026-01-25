import { useState, useMemo, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2, DollarSign, Calendar, RefreshCw } from 'lucide-react';

interface MonthlyBuy {
  month: string; // YYYY-MM format
  date: string; // actual purchase date
  shares: number;
  pricePerShare: number;
  amount: number;
  locked: boolean;
}

interface Stock {
  id: number;
  ticker: string;
  name: string;
  addedQuarter: string; // e.g., "Q1 2026"
  addedMonth: string; // YYYY-MM format (first month)
  currentPrice: number;
  monthlyBuys: MonthlyBuy[];
}

interface Settings {
  monthlyInvestment: number;
  startDate: string; // "2026-01"
  endDate: string; // "2028-12"
}

const STORAGE_KEY = 'multiBaggerTracker:v2';

// Generate all months from start to end
function generateMonths(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);

  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

// Get quarter string from month
function getQuarter(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const q = Math.ceil(month / 3);
  return `Q${q} ${year}`;
}

// Get all quarters from start to end
function generateQuarters(startDate: string, endDate: string): string[] {
  const quarters: string[] = [];
  const months = generateMonths(startDate, endDate);

  months.forEach(m => {
    const q = getQuarter(m);
    if (!quarters.includes(q)) {
      quarters.push(q);
    }
  });
  return quarters;
}

// Format month for display
function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Get current month string
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function InvestmentTrackerView() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [settings, setSettings] = useState<Settings>({
    monthlyInvestment: 5000,
    startDate: '2026-01',
    endDate: '2028-12'
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState<{ stock: Stock; month: string } | null>(null);
  const [newStock, setNewStock] = useState({
    ticker: '',
    name: '',
    quarter: '',
    shares: '',
    pricePerShare: '',
    currentPrice: ''
  });
  const [buyForm, setBuyForm] = useState({
    shares: '',
    pricePerShare: '',
    date: new Date().toISOString().split('T')[0]
  });

  const allMonths = useMemo(() => generateMonths(settings.startDate, settings.endDate), [settings.startDate, settings.endDate]);
  const allQuarters = useMemo(() => generateQuarters(settings.startDate, settings.endDate), [settings.startDate, settings.endDate]);

  // Load data from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.stocks) setStocks(data.stocks);
        if (data.settings) setSettings(data.settings);
      }
    } catch (e) {
      console.error('Error loading data:', e);
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stocks, settings }));
    } catch (e) {
      console.error('Error saving data:', e);
    }
  }, [stocks, settings]);

  // Check which quarters already have a stock
  const usedQuarters = useMemo(() => {
    return stocks.map(s => s.addedQuarter);
  }, [stocks]);

  // Get available quarters for new stock
  const availableQuarters = useMemo(() => {
    return allQuarters.filter(q => !usedQuarters.includes(q));
  }, [allQuarters, usedQuarters]);

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    let totalInvested = 0;
    let totalCurrentValue = 0;

    stocks.forEach(stock => {
      const invested = stock.monthlyBuys.reduce((sum, buy) => sum + buy.amount, 0);
      const totalShares = stock.monthlyBuys.reduce((sum, buy) => sum + buy.shares, 0);
      const currentValue = totalShares * stock.currentPrice;

      totalInvested += invested;
      totalCurrentValue += currentValue;
    });

    const profit = totalCurrentValue - totalInvested;
    const returnPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return { totalInvested, totalCurrentValue, profit, returnPct };
  }, [stocks]);

  // Get stock details
  const getStockDetails = useCallback((stock: Stock) => {
    const totalShares = stock.monthlyBuys.reduce((sum, buy) => sum + buy.shares, 0);
    const totalInvested = stock.monthlyBuys.reduce((sum, buy) => sum + buy.amount, 0);
    const avgPrice = totalShares > 0 ? totalInvested / totalShares : 0;
    const currentValue = totalShares * stock.currentPrice;
    const profit = currentValue - totalInvested;
    const returnPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // Calculate remaining months for this stock
    const stockMonths = allMonths.filter(m => m >= stock.addedMonth);
    const completedMonths = stock.monthlyBuys.length;
    const remainingMonths = stockMonths.length - completedMonths;

    return { totalShares, totalInvested, avgPrice, currentValue, profit, returnPct, remainingMonths, stockMonths };
  }, [allMonths]);

  // Generate upcoming investments table
  const upcomingInvestments = useMemo(() => {
    const upcoming: { month: string; investments: { ticker: string; stockId: number; done: boolean }[] }[] = [];

    allMonths.forEach(month => {
      const investments: { ticker: string; stockId: number; done: boolean }[] = [];

      stocks.forEach(stock => {
        // Check if this stock should have an investment this month
        if (month >= stock.addedMonth) {
          const hasBuy = stock.monthlyBuys.some(b => b.month === month);
          investments.push({
            ticker: stock.ticker,
            stockId: stock.id,
            done: hasBuy
          });
        }
      });

      if (investments.length > 0) {
        upcoming.push({ month, investments });
      }
    });

    return upcoming;
  }, [allMonths, stocks]);

  // Get first month of a quarter
  const getFirstMonthOfQuarter = (quarter: string): string => {
    const match = quarter.match(/Q(\d) (\d{4})/);
    if (!match) return settings.startDate;
    const q = parseInt(match[1]);
    const year = match[2];
    const month = (q - 1) * 3 + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  };

  const handleAddStock = () => {
    if (!newStock.ticker || !newStock.quarter || !newStock.shares || !newStock.pricePerShare) {
      alert('Please fill in all required fields');
      return;
    }

    const firstMonth = getFirstMonthOfQuarter(newStock.quarter);
    const shares = parseFloat(newStock.shares);
    const price = parseFloat(newStock.pricePerShare);

    const stock: Stock = {
      id: Date.now(),
      ticker: newStock.ticker.toUpperCase(),
      name: newStock.name,
      addedQuarter: newStock.quarter,
      addedMonth: firstMonth,
      currentPrice: parseFloat(newStock.currentPrice) || price,
      monthlyBuys: [{
        month: firstMonth,
        date: new Date().toISOString().split('T')[0],
        shares,
        pricePerShare: price,
        amount: shares * price,
        locked: true
      }]
    };

    setStocks([...stocks, stock]);
    setShowAddModal(false);
    setNewStock({ ticker: '', name: '', quarter: '', shares: '', pricePerShare: '', currentPrice: '' });
  };

  const handleRecordBuy = () => {
    if (!showBuyModal || !buyForm.shares || !buyForm.pricePerShare) {
      alert('Please fill in all required fields');
      return;
    }

    const { stock, month } = showBuyModal;
    const shares = parseFloat(buyForm.shares);
    const price = parseFloat(buyForm.pricePerShare);

    const newBuy: MonthlyBuy = {
      month,
      date: buyForm.date,
      shares,
      pricePerShare: price,
      amount: shares * price,
      locked: true
    };

    setStocks(stocks.map(s =>
      s.id === stock.id
        ? { ...s, monthlyBuys: [...s.monthlyBuys, newBuy].sort((a, b) => a.month.localeCompare(b.month)) }
        : s
    ));

    setShowBuyModal(null);
    setBuyForm({ shares: '', pricePerShare: '', date: new Date().toISOString().split('T')[0] });
  };

  const handleUpdatePrice = (stockId: number) => {
    const stock = stocks.find(s => s.id === stockId);
    if (!stock) return;

    const price = prompt(`Enter current price for ${stock.ticker}:`, String(stock.currentPrice));
    if (price) {
      setStocks(stocks.map(s =>
        s.id === stockId ? { ...s, currentPrice: parseFloat(price) } : s
      ));
    }
  };

  const handleDeleteStock = (stockId: number) => {
    if (confirm('Are you sure you want to delete this stock and all its buys?')) {
      setStocks(stocks.filter(s => s.id !== stockId));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const currentMonth = getCurrentMonth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-2">Multi-Bagger Investment Tracker</h1>
        <p className="text-gray-400">
          1 new stock per quarter | Monthly investments until Dec 2028 | 12 stocks total
        </p>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Portfolio Value</span>
            <DollarSign className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-3xl font-bold mb-2">{formatCurrency(portfolioMetrics.totalCurrentValue)}</div>
          <div className="flex items-center gap-4 text-sm">
            <span className={portfolioMetrics.profit >= 0 ? 'text-green-200' : 'text-red-200'}>
              {portfolioMetrics.profit >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.profit)}
            </span>
            <span className={portfolioMetrics.returnPct >= 0 ? 'text-green-200' : 'text-red-200'}>
              {portfolioMetrics.returnPct >= 0 ? '+' : ''}{portfolioMetrics.returnPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Total Invested</span>
            <TrendingUp className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(portfolioMetrics.totalInvested)}</div>
          <div className="text-sm text-gray-400 mt-1">
            {stocks.length} of 12 stocks
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Monthly Target</span>
            <Calendar className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(settings.monthlyInvestment)}</div>
          <div className="text-sm text-gray-400 mt-1">
            per stock
          </div>
        </div>
      </div>

      {/* Current Stocks */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">My Stocks ({stocks.length}/12)</h2>
          <button
            onClick={() => {
              if (availableQuarters.length === 0) {
                alert('All 12 quarters already have a stock!');
                return;
              }
              setNewStock({ ...newStock, quarter: availableQuarters[0] });
              setShowAddModal(true);
            }}
            disabled={stocks.length >= 12}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
          >
            <Plus className="w-4 h-4" />
            Add New Stock
          </button>
        </div>

        {stocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Stock</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Added</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Shares</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Avg Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Invested</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">P&L</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Buys Left</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {stocks.map(stock => {
                  const details = getStockDetails(stock);
                  return (
                    <tr key={stock.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{stock.ticker}</div>
                        <div className="text-xs text-gray-500">{stock.name}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-300">{stock.addedQuarter}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{details.totalShares.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">${details.avgPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleUpdatePrice(stock.id)}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                          title="Click to update"
                        >
                          ${stock.currentPrice.toFixed(2)}
                          <RefreshCw className="w-3 h-3 inline ml-1" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(details.totalInvested)}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{formatCurrency(details.currentValue)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${details.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {details.profit >= 0 ? '+' : ''}{formatCurrency(details.profit)}
                        <div className="text-xs">
                          {details.returnPct >= 0 ? '+' : ''}{details.returnPct.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-gray-700 rounded text-sm text-gray-300">
                          {details.remainingMonths}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteStock(stock.id)}
                          className="p-1.5 text-red-400 hover:bg-red-900/50 rounded"
                          title="Delete stock"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No stocks yet. Click "Add New Stock" to start building your portfolio.
          </div>
        )}
      </div>

      {/* All Buys History */}
      {stocks.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-5 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">All Buy Transactions</h2>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Stock</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Shares</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {stocks.flatMap(stock =>
                  stock.monthlyBuys.map(buy => ({
                    ...buy,
                    ticker: stock.ticker,
                    stockId: stock.id
                  }))
                )
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((buy, idx) => (
                  <tr key={`${buy.stockId}-${buy.month}-${idx}`} className="hover:bg-gray-700/30">
                    <td className="px-4 py-2 text-sm text-gray-300">{buy.date}</td>
                    <td className="px-4 py-2 text-sm font-medium text-white">{buy.ticker}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-300">{buy.shares.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-300">${buy.pricePerShare.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-white">{formatCurrency(buy.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming Investments Schedule */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Investment Schedule</h2>
          <p className="text-sm text-gray-400 mt-1">Monthly investments for each stock until Dec 2028</p>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase sticky left-0 bg-gray-900">Month</th>
                {stocks.map(stock => (
                  <th key={stock.id} className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase min-w-[80px]">
                    {stock.ticker}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {upcomingInvestments.map(({ month, investments }) => {
                const isPast = month < currentMonth;
                const isCurrent = month === currentMonth;
                const totalForMonth = investments.filter(i => i.done).reduce((sum, i) => {
                  const stock = stocks.find(s => s.id === i.stockId);
                  const buy = stock?.monthlyBuys.find(b => b.month === month);
                  return sum + (buy?.amount || 0);
                }, 0);

                return (
                  <tr
                    key={month}
                    className={`${isCurrent ? 'bg-blue-900/20' : ''} ${isPast ? 'opacity-60' : ''} hover:bg-gray-700/30`}
                  >
                    <td className={`px-4 py-2 text-sm font-medium sticky left-0 ${isCurrent ? 'bg-blue-900/40 text-blue-300' : 'bg-gray-800 text-gray-300'}`}>
                      {formatMonth(month)}
                      {isCurrent && <span className="ml-2 text-xs bg-blue-600 px-1.5 py-0.5 rounded">NOW</span>}
                    </td>
                    {stocks.map(stock => {
                      const isApplicable = month >= stock.addedMonth;
                      const buy = stock.monthlyBuys.find(b => b.month === month);

                      if (!isApplicable) {
                        return (
                          <td key={stock.id} className="px-3 py-2 text-center text-gray-600">
                            -
                          </td>
                        );
                      }

                      if (buy) {
                        return (
                          <td key={stock.id} className="px-3 py-2 text-center">
                            <span className="text-green-400 text-sm font-medium">
                              ${buy.amount.toFixed(0)}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={stock.id} className="px-3 py-2 text-center">
                          {!isPast ? (
                            <button
                              onClick={() => {
                                setShowBuyModal({ stock, month });
                                setBuyForm({
                                  shares: '',
                                  pricePerShare: String(stock.currentPrice),
                                  date: new Date().toISOString().split('T')[0]
                                });
                              }}
                              className="text-xs px-2 py-1 bg-yellow-600/30 text-yellow-400 rounded hover:bg-yellow-600/50 transition"
                            >
                              Record
                            </button>
                          ) : (
                            <span className="text-red-400 text-xs">Missed</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right text-sm font-medium text-white">
                      {totalForMonth > 0 ? formatCurrency(totalForMonth) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Monthly Investment ($)</label>
            <input
              type="number"
              value={settings.monthlyInvestment}
              onChange={(e) => setSettings({...settings, monthlyInvestment: parseInt(e.target.value) || 0})}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Start Date</label>
            <input
              type="month"
              value={settings.startDate}
              onChange={(e) => setSettings({...settings, startDate: e.target.value})}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">End Date</label>
            <input
              type="month"
              value={settings.endDate}
              onChange={(e) => setSettings({...settings, endDate: e.target.value})}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Add New Stock</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Quarter *</label>
                <select
                  value={newStock.quarter}
                  onChange={(e) => setNewStock({...newStock, quarter: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select quarter</option>
                  {availableQuarters.map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Only 1 stock allowed per quarter</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Ticker Symbol *</label>
                <input
                  type="text"
                  value={newStock.ticker}
                  onChange={(e) => setNewStock({...newStock, ticker: e.target.value.toUpperCase()})}
                  placeholder="e.g., AAPL"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newStock.name}
                  onChange={(e) => setNewStock({...newStock, name: e.target.value})}
                  placeholder="e.g., Apple Inc."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Shares *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.shares}
                    onChange={(e) => setNewStock({...newStock, shares: e.target.value})}
                    placeholder="e.g., 10"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Buy Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStock.pricePerShare}
                    onChange={(e) => setNewStock({...newStock, pricePerShare: e.target.value})}
                    placeholder="e.g., 150.00"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Current Price (for tracking)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newStock.currentPrice}
                  onChange={(e) => setNewStock({...newStock, currentPrice: e.target.value})}
                  placeholder="Leave empty to use buy price"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStock}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Add Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Buy Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-2">Record Buy</h3>
            <p className="text-gray-400 mb-4">
              {showBuyModal.stock.ticker} - {formatMonth(showBuyModal.month)}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={buyForm.date}
                  onChange={(e) => setBuyForm({...buyForm, date: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Shares *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={buyForm.shares}
                    onChange={(e) => setBuyForm({...buyForm, shares: e.target.value})}
                    placeholder="e.g., 10"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Buy Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={buyForm.pricePerShare}
                    onChange={(e) => setBuyForm({...buyForm, pricePerShare: e.target.value})}
                    placeholder="e.g., 150.00"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              {buyForm.shares && buyForm.pricePerShare && (
                <div className="p-3 bg-gray-700/50 rounded-lg">
                  <div className="text-sm text-gray-400">Total Amount:</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrency(parseFloat(buyForm.shares) * parseFloat(buyForm.pricePerShare))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowBuyModal(null)}
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordBuy}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Record Buy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

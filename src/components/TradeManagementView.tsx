import { useState, useEffect, useCallback } from 'react';

interface Portion {
  filled: boolean;
  price: number;
  quantity: number;
}

interface ClosedInfo {
  symbol: string;
  avgPrice: number;
  currentPrice: number;
  quantity: number;
  spend: number;
  pnl: number;
}

interface Position {
  id: number;
  status: 'available' | 'active' | 'stopped' | 'closed';
  stockName: string;
  tradeGrade: number | null;
  tradeNotes: string;
  capitalAllocated: number;
  capitalPerPortion: number;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  stopLossPrice: number;
  pnl: number;
  currentSpend: number;
  portions: Portion[];
  closedInfo: ClosedInfo | null;
}

interface TradingData {
  startCapital: number;
  totalPositions: number;
  portionsPerPosition: number;
  stopLossAmount: number;
  positions: Position[];
}

interface PositionSizer {
  totalCapital: number;
  riskAmount: number;
  entryPrice: number;
  stopPrice: number;
}

interface DailyReport {
  q1: string;
  q2: string;
  q3: string;
}

const SIZER_STORAGE_KEY = 'positionSizer:v1';
const STATE_STORAGE_KEY = 'tradeManagement:v1';

function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `dailyReport:${yyyy}-${mm}-${dd}`;
}

export function TradeManagementView() {
  const [tradingData, setTradingData] = useState<TradingData>({
    startCapital: 20000,
    totalPositions: 4,
    portionsPerPosition: 5,
    stopLossAmount: 500,
    positions: [],
  });

  const [positionSizer, setPositionSizer] = useState<PositionSizer>({
    totalCapital: 0,
    riskAmount: 0,
    entryPrice: 0,
    stopPrice: 0,
  });

  const [dailyReport, setDailyReport] = useState<DailyReport>({
    q1: '',
    q2: '',
    q3: '',
  });

  const [formInputs, setFormInputs] = useState({
    startCapital: '20000',
    totalPositions: '4',
    portionsPerPosition: '5',
    stopLossAmount: '500',
  });

  const [positionInputs, setPositionInputs] = useState<Record<number, {
    symbol: string;
    price: string;
    quantity: string;
    currentPrice: string;
  }>>({});

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const savedSizer = localStorage.getItem(SIZER_STORAGE_KEY);
      if (savedSizer) {
        setPositionSizer(JSON.parse(savedSizer));
      }

      const savedState = localStorage.getItem(STATE_STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        setTradingData(parsed);
        setFormInputs({
          startCapital: String(parsed.startCapital),
          totalPositions: String(parsed.totalPositions),
          portionsPerPosition: String(parsed.portionsPerPosition),
          stopLossAmount: String(parsed.stopLossAmount),
        });
      } else {
        initializePositions();
      }

      const savedReport = localStorage.getItem(getTodayKey());
      if (savedReport) {
        setDailyReport(JSON.parse(savedReport));
      }
    } catch (e) {
      console.error('Error loading saved state:', e);
      initializePositions();
    }
  }, []);

  // Save trading data to localStorage
  useEffect(() => {
    if (tradingData.positions.length > 0) {
      try {
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(tradingData));
      } catch (e) {
        console.error('Error saving state:', e);
      }
    }
  }, [tradingData]);

  // Save position sizer to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SIZER_STORAGE_KEY, JSON.stringify(positionSizer));
    } catch (e) {
      console.error('Error saving sizer:', e);
    }
  }, [positionSizer]);

  const initializePositions = useCallback(() => {
    const startCapital = parseFloat(formInputs.startCapital) || 20000;
    const totalPositions = parseInt(formInputs.totalPositions) || 4;
    const portionsPerPosition = parseInt(formInputs.portionsPerPosition) || 5;
    const stopLossAmount = parseFloat(formInputs.stopLossAmount) || 500;

    const capitalPerPosition = startCapital / totalPositions;
    const capitalPerPortion = capitalPerPosition / portionsPerPosition;

    const positions: Position[] = [];
    for (let i = 0; i < totalPositions; i++) {
      positions.push({
        id: i + 1,
        status: 'available',
        stockName: '',
        tradeGrade: null,
        tradeNotes: '',
        capitalAllocated: capitalPerPosition,
        capitalPerPortion: capitalPerPortion,
        totalQuantity: 0,
        averagePrice: 0,
        currentPrice: 0,
        stopLossPrice: 0,
        pnl: 0,
        currentSpend: 0,
        portions: Array(portionsPerPosition).fill(null).map(() => ({
          filled: false,
          price: 0,
          quantity: 0,
        })),
        closedInfo: null,
      });
    }

    setTradingData({
      startCapital,
      totalPositions,
      portionsPerPosition,
      stopLossAmount,
      positions,
    });
  }, [formInputs]);

  const computeSizer = useCallback(() => {
    const cap = Math.max(0, positionSizer.totalCapital);
    const riskAmt = Math.max(0, positionSizer.riskAmount);
    const entry = Math.max(0, positionSizer.entryPrice);
    const stop = Math.max(0, positionSizer.stopPrice);

    const riskPerShare = Math.max(0, entry - stop);
    const costPerShare = entry;
    const maxByRisk = riskPerShare > 0 ? Math.floor(riskAmt / riskPerShare) : 0;
    const maxByCapital = costPerShare > 0 ? Math.floor(cap / costPerShare) : 0;
    const maxShares = Math.max(0, Math.min(maxByRisk, maxByCapital));
    const positionSize = maxShares * costPerShare;
    const percentRisked = cap > 0 ? (maxShares * riskPerShare) / cap : 0;
    const capitalRemaining = Math.max(0, cap - positionSize);

    return { maxShares, positionSize, riskPerShare, percentRisked, capitalRemaining };
  }, [positionSizer]);

  const sizerResults = computeSizer();

  const addPortion = (positionId: number) => {
    const input = positionInputs[positionId] || { symbol: '', price: '', quantity: '', currentPrice: '' };
    const symbol = input.symbol.trim().toUpperCase();
    const price = parseFloat(input.price);
    const quantity = parseInt(input.quantity);

    if (!symbol) {
      alert('Please enter a stock symbol');
      return;
    }
    if (!price || price <= 0) {
      alert('Please enter a valid buy price');
      return;
    }
    if (!quantity || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setTradingData(prev => {
      const positions = [...prev.positions];
      const position = { ...positions[positionId - 1] };

      const totalCost = price * quantity;
      if (totalCost > position.capitalPerPortion) {
        alert(`Cost (${totalCost.toFixed(2)}) exceeds portion limit (${position.capitalPerPortion.toFixed(2)})`);
        return prev;
      }

      const filledPortions = position.portions.filter(p => p.filled).length;
      if (filledPortions >= prev.portionsPerPosition) {
        alert('All portions already filled');
        return prev;
      }

      const portions = [...position.portions];
      const nextPortionIdx = portions.findIndex(p => !p.filled);
      if (nextPortionIdx === -1) return prev;

      portions[nextPortionIdx] = { filled: true, price, quantity };

      position.portions = portions;
      position.stockName = symbol;
      position.totalQuantity += quantity;
      position.currentSpend += price * quantity;

      // Calculate average price
      const allFilled = portions.filter(p => p.filled);
      const totalCostAll = allFilled.reduce((sum, p) => sum + (p.price * p.quantity), 0);
      const totalQty = allFilled.reduce((sum, p) => sum + p.quantity, 0);
      position.averagePrice = totalCostAll / totalQty;
      position.currentPrice = price;
      position.status = 'active';
      position.stopLossPrice = position.averagePrice - (prev.stopLossAmount / position.totalQuantity);
      position.pnl = (position.currentPrice - position.averagePrice) * position.totalQuantity;

      positions[positionId - 1] = position;

      return { ...prev, positions };
    });

    // Clear inputs
    setPositionInputs(prev => ({
      ...prev,
      [positionId]: { ...prev[positionId], price: '', quantity: '' },
    }));
  };

  const updatePrice = (positionId: number) => {
    const input = positionInputs[positionId] || { symbol: '', price: '', quantity: '', currentPrice: '' };
    const price = parseFloat(input.currentPrice);

    if (!price || price <= 0) {
      alert('Please enter a valid current price');
      return;
    }

    setTradingData(prev => {
      const positions = [...prev.positions];
      const position = { ...positions[positionId - 1] };

      position.currentPrice = price;
      if (price <= position.stopLossPrice && position.status === 'active') {
        alert(`Stop loss triggered at ${price.toFixed(2)}! Consider closing position.`);
      }
      position.pnl = (position.currentPrice - position.averagePrice) * position.totalQuantity;

      positions[positionId - 1] = position;
      return { ...prev, positions };
    });
  };

  const stopPosition = (positionId: number) => {
    setTradingData(prev => {
      const positions = [...prev.positions];
      const position = { ...positions[positionId - 1] };

      if (position.totalQuantity === 0) {
        alert('No active position to stop');
        return prev;
      }

      const stopLossPnL = (position.stopLossPrice - position.averagePrice) * position.totalQuantity;

      position.closedInfo = {
        symbol: position.stockName || 'N/A',
        avgPrice: position.averagePrice,
        currentPrice: position.stopLossPrice,
        quantity: position.totalQuantity,
        spend: position.averagePrice * position.totalQuantity,
        pnl: stopLossPnL,
      };

      alert(`Stop loss executed: ${position.totalQuantity} shares of ${position.stockName} sold at ${position.stopLossPrice.toFixed(2)}. Loss: $${Math.abs(stopLossPnL).toFixed(2)}`);

      position.status = 'stopped';
      position.pnl = stopLossPnL;
      position.currentPrice = position.stopLossPrice;
      position.currentSpend = 0;
      position.totalQuantity = 0;
      position.averagePrice = 0;
      position.stopLossPrice = 0;
      position.portions = position.portions.map(() => ({ filled: false, price: 0, quantity: 0 }));

      positions[positionId - 1] = position;
      return { ...prev, positions };
    });
  };

  const closeTrade = (positionId: number) => {
    const position = tradingData.positions[positionId - 1];
    if (position.totalQuantity === 0) {
      alert('No shares to sell');
      return;
    }

    const sellQuantityStr = prompt(`Enter quantity to sell (Max: ${position.totalQuantity}):`);
    const sellPriceStr = prompt('Enter sell price per share:');

    if (!sellQuantityStr || !sellPriceStr) return;

    const qty = parseInt(sellQuantityStr);
    const price = parseFloat(sellPriceStr);

    if (qty <= 0 || qty > position.totalQuantity) {
      alert('Invalid quantity');
      return;
    }
    if (price <= 0) {
      alert('Invalid price');
      return;
    }

    setTradingData(prev => {
      const positions = [...prev.positions];
      const pos = { ...positions[positionId - 1] };

      const tradePnL = (price - pos.averagePrice) * qty;
      const prevQty = pos.totalQuantity;
      const prevAvg = pos.averagePrice;
      const prevSpend = pos.currentSpend;
      const prevSymbol = pos.stockName;

      pos.totalQuantity -= qty;
      pos.pnl = tradePnL + ((pos.currentPrice - pos.averagePrice) * pos.totalQuantity);
      pos.currentSpend = pos.averagePrice * pos.totalQuantity;

      if (pos.totalQuantity === 0) {
        pos.status = 'closed';
        pos.closedInfo = {
          symbol: prevSymbol || 'N/A',
          avgPrice: prevAvg,
          currentPrice: price,
          quantity: prevQty,
          spend: prevSpend,
          pnl: tradePnL,
        };
        pos.stockName = prevSymbol || '';
        pos.averagePrice = prevAvg;
        pos.currentPrice = price;
        pos.stopLossPrice = 0;
        pos.pnl = tradePnL;
        pos.currentSpend = 0;
        pos.portions = pos.portions.map(() => ({ filled: false, price: 0, quantity: 0 }));
      } else {
        pos.stopLossPrice = pos.averagePrice - (prev.stopLossAmount / pos.totalQuantity);
      }

      alert(`Trade closed: ${qty} shares at $${price.toFixed(2)}. P&L: $${tradePnL.toFixed(2)}`);

      positions[positionId - 1] = pos;
      return { ...prev, positions };
    });
  };

  const resetSinglePosition = (positionId: number) => {
    setTradingData(prev => {
      const positions = [...prev.positions];
      const pos = { ...positions[positionId - 1] };

      pos.status = 'available';
      pos.stockName = '';
      pos.totalQuantity = 0;
      pos.tradeGrade = null;
      pos.tradeNotes = '';
      pos.averagePrice = 0;
      pos.currentPrice = 0;
      pos.stopLossPrice = 0;
      pos.pnl = 0;
      pos.currentSpend = 0;
      pos.closedInfo = null;
      pos.portions = pos.portions.map(() => ({ filled: false, price: 0, quantity: 0 }));

      positions[positionId - 1] = pos;
      return { ...prev, positions };
    });

    setPositionInputs(prev => ({
      ...prev,
      [positionId]: { symbol: '', price: '', quantity: '', currentPrice: '' },
    }));
  };

  const setTradeGrade = (positionId: number, grade: number) => {
    setTradingData(prev => {
      const positions = [...prev.positions];
      const pos = { ...positions[positionId - 1] };
      pos.tradeGrade = pos.tradeGrade === grade ? null : grade;
      positions[positionId - 1] = pos;
      return { ...prev, positions };
    });
  };

  const setTradeNotes = (positionId: number, notes: string) => {
    setTradingData(prev => {
      const positions = [...prev.positions];
      const pos = { ...positions[positionId - 1] };
      pos.tradeNotes = notes;
      positions[positionId - 1] = pos;
      return { ...prev, positions };
    });
  };

  const saveDailyReportHandler = () => {
    try {
      localStorage.setItem(getTodayKey(), JSON.stringify(dailyReport));
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(null), 1500);
    } catch (e) {
      console.error('Error saving daily report:', e);
    }
  };

  const resetAll = () => {
    if (confirm('Are you sure you want to reset all positions and start a new trading day?')) {
      try {
        localStorage.removeItem(STATE_STORAGE_KEY);
        localStorage.removeItem(SIZER_STORAGE_KEY);
        localStorage.removeItem(getTodayKey());
      } catch (e) {
        console.error('Error clearing storage:', e);
      }

      setPositionSizer({ totalCapital: 0, riskAmount: 0, entryPrice: 0, stopPrice: 0 });
      setDailyReport({ q1: '', q2: '', q3: '' });
      setPositionInputs({});
      initializePositions();
    }
  };

  const exportToPDF = () => {
    const totalCapital = tradingData.startCapital;
    const deployedCapital = tradingData.positions.reduce((sum, pos) => sum + (pos.currentSpend || 0), 0);
    const availableCapital = totalCapital - deployedCapital;
    const totalPnL = tradingData.positions.reduce((sum, pos) => sum + pos.pnl, 0);

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rows = tradingData.positions.map(p => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.id}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${esc(p.stockName || 'N/A')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.tradeGrade || '-'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;max-width:200px;word-wrap:break-word;">${esc(p.tradeNotes || '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.status}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">$${(p.currentSpend || 0).toFixed(2)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.totalQuantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.averagePrice.toFixed(2)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.currentPrice.toFixed(2)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:${p.pnl >= 0 ? '#22c55e' : '#ef4444'}">$${p.pnl.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <html>
      <head>
        <title>Day Trading Position Summary</title>
        <meta charset="utf-8" />
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a202c;margin:24px}
          h1{margin:0 0 8px 0}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          th{background:#f7fafc;text-align:left;padding:8px 10px;border-bottom:2px solid #e2e8f0}
          .summary{margin-top:16px}
          .daily{margin-top:20px}
          .daily h2{margin:0 0 8px 0}
          .daily .q{margin:8px 0}
        </style>
      </head>
      <body>
        <h1>Day Trading Position Summary</h1>
        <div style="color:#4a5568;margin-bottom:10px">Generated: ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Pos</th><th>Symbol</th><th>Grade</th><th>Notes</th><th>Status</th><th>Spend</th><th>Qty</th><th>Avg</th><th>Current</th><th>P&L</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="summary">
          <div><strong>Total Capital:</strong> $${totalCapital.toFixed(2)}</div>
          <div><strong>Deployed Capital:</strong> $${deployedCapital.toFixed(2)}</div>
          <div><strong>Available Capital:</strong> $${availableCapital.toFixed(2)}</div>
          <div><strong>Total P&L:</strong> <span style="color:${totalPnL >= 0 ? '#22c55e' : '#ef4444'}">$${totalPnL.toFixed(2)}</span></div>
        </div>
        <div class="daily">
          <h2>Daily Report</h2>
          <div class="q"><strong>Q1. What one thing you did correct?</strong><br/>${esc(dailyReport.q1)}</div>
          <div class="q"><strong>Q2. What one thing you did wrong?</strong><br/>${esc(dailyReport.q2)}</div>
          <div class="q"><strong>Q3. Which part of the system would you change?</strong><br/>${esc(dailyReport.q3)}</div>
        </div>
        <script>window.onload = function(){window.print();};</script>
      </body>
      </html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked. Please allow popups to print the report.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Calculate summary
  const totalCapital = tradingData.startCapital;
  const deployedCapital = tradingData.positions.reduce((sum, pos) => sum + (pos.currentSpend || 0), 0);
  const availableCapital = totalCapital - deployedCapital;
  const totalPnL = tradingData.positions.reduce((sum, pos) => sum + pos.pnl, 0);

  const getPositionInput = (positionId: number) => {
    return positionInputs[positionId] || { symbol: '', price: '', quantity: '', currentPrice: '' };
  };

  const updatePositionInput = (positionId: number, field: string, value: string) => {
    setPositionInputs(prev => ({
      ...prev,
      [positionId]: { ...getPositionInput(positionId), [field]: value },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-2">Day Trading Position Manager</h1>
        <p className="text-gray-400">Systematic Stock Trading with Risk Management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Settings Card */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Trading Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Starting Capital ($)</label>
                <input
                  type="number"
                  value={formInputs.startCapital}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, startCapital: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Total Positions</label>
                <input
                  type="number"
                  value={formInputs.totalPositions}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, totalPositions: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Portions per Position</label>
                <input
                  type="number"
                  value={formInputs.portionsPerPosition}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, portionsPerPosition: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Stop Loss per Position ($)</label>
                <input
                  type="number"
                  value={formInputs.stopLossAmount}
                  onChange={(e) => setFormInputs(prev => ({ ...prev, stopLossAmount: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={initializePositions}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Initialize Trading Day
              </button>

              <button
                onClick={resetAll}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Reset All Positions
              </button>
            </div>

            {/* Strategy Summary */}
            <div className="mt-6 p-4 bg-gray-700/50 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Strategy Summary</h4>
              <div className="text-xs text-gray-400 space-y-1">
                <p><strong className="text-gray-300">Stocks:</strong> Costs are price x shares</p>
                <p><strong className="text-gray-300">Example:</strong> 30 shares at $30 = $900</p>
                <p><strong className="text-gray-300">Stop Loss:</strong> Fixed ${tradingData.stopLossAmount} per position</p>
                <p><strong className="text-gray-300">Auto:</strong> P&L, avg price, stop price</p>
              </div>
            </div>
          </div>

          {/* Position Sizer Card */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Position Sizer</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Total Capital ($)</label>
                <input
                  type="number"
                  value={positionSizer.totalCapital || ''}
                  onChange={(e) => setPositionSizer(prev => ({ ...prev, totalCapital: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={positionSizer.entryPrice || ''}
                    onChange={(e) => setPositionSizer(prev => ({ ...prev, entryPrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Stop Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={positionSizer.stopPrice || ''}
                    onChange={(e) => setPositionSizer(prev => ({ ...prev, stopPrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Risk Amount ($)</label>
                <input
                  type="number"
                  value={positionSizer.riskAmount || ''}
                  onChange={(e) => setPositionSizer(prev => ({ ...prev, riskAmount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Results */}
              <div className="pt-3 border-t border-gray-700 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Max Shares:</span>
                  <span className="text-white font-medium">{sizerResults.maxShares}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Position Size:</span>
                  <span className="text-white font-medium">${sizerResults.positionSize.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Risk/Share:</span>
                  <span className="text-white font-medium">${sizerResults.riskPerShare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">% Risked:</span>
                  <span className="text-white font-medium">{(sizerResults.percentRisked * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Capital Left:</span>
                  <span className="text-white font-medium">${sizerResults.capitalRemaining.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Summary Card */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-white">${totalCapital.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Total Capital</div>
              </div>
              <div className="text-center p-3 bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-cyan-400">${deployedCapital.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Deployed</div>
              </div>
              <div className="text-center p-3 bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-emerald-400">${availableCapital.toLocaleString()}</div>
                <div className="text-sm text-gray-400">Available</div>
              </div>
              <div className="text-center p-3 bg-gray-700/50 rounded-lg">
                <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${totalPnL.toFixed(2)}
                </div>
                <div className="text-sm text-gray-400">Total P&L</div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Close Day & Export PDF
              </button>
            </div>
          </div>

          {/* Position Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tradingData.positions.map((position) => {
              const input = getPositionInput(position.id);
              const portionsFilled = position.portions.filter(p => p.filled).length;
              const remainingAllocation = Math.max(position.capitalAllocated - position.currentSpend, 0);

              return (
                <div
                  key={position.id}
                  className={`bg-gray-800 rounded-xl p-5 border border-gray-700 ${
                    position.status === 'closed' ? 'opacity-60' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">Position {position.id}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                      position.status === 'available' ? 'bg-emerald-900/50 text-emerald-400' :
                      position.status === 'active' ? 'bg-cyan-900/50 text-cyan-400' :
                      position.status === 'stopped' ? 'bg-red-900/50 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {position.status}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Symbol:</span>
                      <span className="text-white font-medium">{position.stockName || 'Not Set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Allocated:</span>
                      <span className="text-white font-medium">${position.capitalAllocated.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Spent:</span>
                      <span className="text-white font-medium">${position.currentSpend.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Left:</span>
                      <span className="text-white font-medium">${remainingAllocation.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Qty:</span>
                      <span className="text-white font-medium">{position.totalQuantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg:</span>
                      <span className="text-white font-medium">${position.averagePrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Current:</span>
                      <span className="text-white font-medium">${position.currentPrice.toFixed(2)}</span>
                    </div>
                    {position.status === 'active' && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Stop:</span>
                        <span className="text-red-400 font-medium">${position.stopLossPrice.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between col-span-2">
                      <span className="text-gray-400">P&L:</span>
                      <span className={`font-bold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${position.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Portions */}
                  <div className="mb-4">
                    <div className="text-sm text-gray-400 mb-2">
                      Portions ({portionsFilled}/{tradingData.portionsPerPosition}):
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {position.portions.map((portion, idx) => (
                        <div
                          key={idx}
                          className={`h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                            portion.filled
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-700 text-gray-400 border border-gray-600'
                          }`}
                        >
                          {portion.filled ? `${portion.quantity}@${portion.price.toFixed(1)}` : `$${position.capitalPerPortion.toFixed(0)}`}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Stock Symbol"
                      value={input.symbol}
                      onChange={(e) => updatePositionInput(position.id, 'symbol', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Buy Price"
                        step="0.01"
                        value={input.price}
                        onChange={(e) => updatePositionInput(position.id, 'price', e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        type="number"
                        placeholder="Quantity"
                        value={input.quantity}
                        onChange={(e) => updatePositionInput(position.id, 'quantity', e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => addPortion(position.id)}
                        disabled={position.status === 'stopped' || position.status === 'closed'}
                        className="py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg text-sm transition-colors"
                      >
                        Add Portion
                      </button>
                      <input
                        type="number"
                        placeholder="Current Price"
                        step="0.01"
                        value={input.currentPrice}
                        onChange={(e) => updatePositionInput(position.id, 'currentPrice', e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updatePrice(position.id)}
                        className="py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors"
                      >
                        Update Price
                      </button>
                      <button
                        onClick={() => stopPosition(position.id)}
                        className="py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors"
                      >
                        Stop Loss Hit
                      </button>
                    </div>

                    <button
                      onClick={() => closeTrade(position.id)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm transition-colors"
                    >
                      Close Trade
                    </button>
                  </div>

                  {/* Trade Review Section */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-400 mb-2">Trade Grade (1-5):</label>
                      <div className="flex gap-2 justify-center">
                        {[1, 2, 3, 4, 5].map(grade => (
                          <button
                            key={grade}
                            onClick={() => setTradeGrade(position.id, grade)}
                            className={`w-8 h-8 rounded-full font-semibold text-sm transition-colors ${
                              position.tradeGrade === grade
                                ? 'bg-cyan-500 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            {grade}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Trade Notes:</label>
                      <textarea
                        placeholder="Enter your trade notes..."
                        value={position.tradeNotes}
                        onChange={(e) => setTradeNotes(position.id, e.target.value)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 resize-y min-h-[80px]"
                      />
                    </div>

                    <button
                      onClick={() => resetSinglePosition(position.id)}
                      className="mt-3 w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold rounded-lg text-sm transition-colors border border-red-600/30"
                    >
                      Reset Position
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Daily Report Card */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Daily Report</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Q1. What one thing you did correct?
                </label>
                <textarea
                  placeholder="Reflect on a single action you executed well today..."
                  value={dailyReport.q1}
                  onChange={(e) => setDailyReport(prev => ({ ...prev, q1: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 resize-y min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Q2. What one thing you did wrong?
                </label>
                <textarea
                  placeholder="Identify a single mistake and why it happened..."
                  value={dailyReport.q2}
                  onChange={(e) => setDailyReport(prev => ({ ...prev, q2: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 resize-y min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Q3. Which part of the system would you change to become a better trader?
                </label>
                <textarea
                  placeholder="Propose one concrete improvement to your process/system..."
                  value={dailyReport.q3}
                  onChange={(e) => setDailyReport(prev => ({ ...prev, q3: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 resize-y min-h-[80px]"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveDailyReportHandler}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                  {saveStatus || 'Save Daily Report'}
                </button>
                <button
                  onClick={() => setDailyReport({ q1: '', q2: '', q3: '' })}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

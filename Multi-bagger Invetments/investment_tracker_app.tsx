import React, { useState, useMemo } from 'react';
import { TrendingUp, Plus, Edit2, Trash2, DollarSign, Target, Calendar, BarChart3, PieChart } from 'lucide-react';

export default function InvestmentTracker() {
  const [positions, setPositions] = useState([
    {
      id: 1,
      ticker: 'AAPL',
      name: 'Apple Inc.',
      startQuarter: 1,
      installments: [
        { quarter: 1, amount: 6667, shares: 50, pricePerShare: 133.34, date: '2025-01-15' },
        { quarter: 2, amount: 6667, shares: 48, pricePerShare: 138.90, date: '2025-04-15' },
        { quarter: 3, amount: 6666, shares: 45, pricePerShare: 148.13, date: '2025-07-15' }
      ],
      currentPrice: 175.50,
    },
    {
      id: 2,
      ticker: 'MSFT',
      name: 'Microsoft Corp.',
      startQuarter: 2,
      installments: [
        { quarter: 2, amount: 6667, shares: 20, pricePerShare: 333.35, date: '2025-04-15' },
        { quarter: 3, amount: 6667, shares: 19, pricePerShare: 350.89, date: '2025-07-15' }
      ],
      currentPrice: 395.20,
    }
  ]);

  const [settings, setSettings] = useState({
    totalCapital: 240000,
    startDate: '2025-01-01',
    currentQuarter: 3
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [newPosition, setNewPosition] = useState({
    ticker: '',
    name: '',
    startQuarter: settings.currentQuarter,
    amount: 6667,
    shares: 0,
    pricePerShare: 0,
    currentPrice: 0
  });

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    let totalInvested = 0;
    let totalCurrentValue = 0;
    let multiBaggers = { threeX: 0, fiveX: 0, tenX: 0 };

    positions.forEach(pos => {
      const invested = pos.installments.reduce((sum, inst) => sum + inst.amount, 0);
      const totalShares = pos.installments.reduce((sum, inst) => sum + inst.shares, 0);
      const currentValue = totalShares * pos.currentPrice;
      
      totalInvested += invested;
      totalCurrentValue += currentValue;

      const multiple = currentValue / invested;
      if (multiple >= 10) multiBaggers.tenX++;
      else if (multiple >= 5) multiBaggers.fiveX++;
      else if (multiple >= 3) multiBaggers.threeX++;
    });

    const profit = totalCurrentValue - totalInvested;
    const returnPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    const multiple = totalInvested > 0 ? totalCurrentValue / totalInvested : 0;
    const deployedPct = (totalInvested / settings.totalCapital) * 100;

    return {
      totalInvested,
      totalCurrentValue,
      profit,
      returnPct,
      multiple,
      deployedPct,
      multiBaggers
    };
  }, [positions, settings.totalCapital]);

  // Generate investment schedule
  const investmentSchedule = useMemo(() => {
    const schedule = [];
    for (let q = 1; q <= 12; q++) {
      const quarter = {
        quarter: q,
        year: Math.ceil(q / 4),
        actions: [],
        totalAmount: 0
      };

      // Check for new positions starting this quarter
      const newPos = positions.filter(p => p.startQuarter === q);
      newPos.forEach(pos => {
        quarter.actions.push({
          type: 'new',
          ticker: pos.ticker,
          amount: 6667
        });
        quarter.totalAmount += 6667;
      });

      // Check for existing positions to add to
      positions.forEach(pos => {
        const quartersSinceStart = q - pos.startQuarter;
        if (quartersSinceStart > 0 && quartersSinceStart < 3) {
          quarter.actions.push({
            type: 'add',
            ticker: pos.ticker,
            amount: 6667,
            installment: quartersSinceStart + 1
          });
          quarter.totalAmount += 6667;
        }
      });

      schedule.push(quarter);
    }
    return schedule;
  }, [positions]);

  // Calculate position details
  const getPositionDetails = (position) => {
    const totalInvested = position.installments.reduce((sum, inst) => sum + inst.amount, 0);
    const totalShares = position.installments.reduce((sum, inst) => sum + inst.shares, 0);
    const currentValue = totalShares * position.currentPrice;
    const profit = currentValue - totalInvested;
    const returnPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    const multiple = totalInvested > 0 ? currentValue / totalInvested : 0;
    const isComplete = position.installments.length >= 3;
    const status = isComplete ? 'Complete' : 'Building';

    return {
      totalInvested,
      totalShares,
      currentValue,
      profit,
      returnPct,
      multiple,
      status,
      installmentsComplete: position.installments.length
    };
  };

  const handleAddPosition = () => {
    if (!newPosition.ticker || !newPosition.shares || !newPosition.pricePerShare) {
      alert('Please fill in all required fields');
      return;
    }

    const position = {
      id: Date.now(),
      ticker: newPosition.ticker.toUpperCase(),
      name: newPosition.name,
      startQuarter: newPosition.startQuarter,
      installments: [{
        quarter: newPosition.startQuarter,
        amount: parseFloat(newPosition.amount),
        shares: parseFloat(newPosition.shares),
        pricePerShare: parseFloat(newPosition.pricePerShare),
        date: new Date().toISOString().split('T')[0]
      }],
      currentPrice: parseFloat(newPosition.currentPrice || newPosition.pricePerShare)
    };

    setPositions([...positions, position]);
    setShowAddModal(false);
    setNewPosition({
      ticker: '',
      name: '',
      startQuarter: settings.currentQuarter,
      amount: 6667,
      shares: 0,
      pricePerShare: 0,
      currentPrice: 0
    });
  };

  const handleDeletePosition = (id) => {
    if (confirm('Are you sure you want to delete this position?')) {
      setPositions(positions.filter(p => p.id !== id));
    }
  };

  const handleAddInstallment = (positionId) => {
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    const lastInstallment = position.installments[position.installments.length - 1];
    const nextQuarter = lastInstallment.quarter + 1;

    if (position.installments.length >= 3) {
      alert('This position is already complete (3 installments)');
      return;
    }

    const shares = prompt('Enter number of shares purchased:');
    const price = prompt('Enter price per share:');
    
    if (shares && price) {
      const newInstallment = {
        quarter: nextQuarter,
        amount: 6667,
        shares: parseFloat(shares),
        pricePerShare: parseFloat(price),
        date: new Date().toISOString().split('T')[0]
      };

      setPositions(positions.map(p => 
        p.id === positionId 
          ? { ...p, installments: [...p.installments, newInstallment] }
          : p
      ));
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    return value.toFixed(decimals);
  };

  // Return scenarios
  const scenarios = [
    { name: 'Conservative', multiple: 3, color: 'bg-green-500' },
    { name: 'Moderate', multiple: 4, color: 'bg-blue-500' },
    { name: 'Aggressive', multiple: 5, color: 'bg-purple-500' },
    { name: 'Stretch', multiple: 6, color: 'bg-red-500' }
  ];

  const currentQuarterSchedule = investmentSchedule[settings.currentQuarter - 1];
  const upcomingQuarters = investmentSchedule.slice(settings.currentQuarter, settings.currentQuarter + 3);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Multi-Bagger Investment Tracker</h1>
          <p className="text-gray-600">12 Stocks | 3-Year Build | 3-Year Hold Strategy</p>
        </div>

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm opacity-90">Portfolio Value</span>
              <DollarSign className="w-5 h-5 opacity-80" />
            </div>
            <div className="text-4xl font-bold mb-2">{formatCurrency(portfolioMetrics.totalCurrentValue)}</div>
            <div className="flex items-center gap-4 text-sm">
              <span className={portfolioMetrics.profit >= 0 ? 'text-green-200' : 'text-red-200'}>
                {portfolioMetrics.profit >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.profit)}
              </span>
              <span className={portfolioMetrics.returnPct >= 0 ? 'text-green-200' : 'text-red-200'}>
                {portfolioMetrics.returnPct >= 0 ? '+' : ''}{formatNumber(portfolioMetrics.returnPct)}%
              </span>
              <span className="text-blue-200">
                {formatNumber(portfolioMetrics.multiple, 2)}x
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Invested</span>
              <Target className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              {formatCurrency(portfolioMetrics.totalInvested)}
            </div>
            <div className="text-sm text-gray-600">
              {formatNumber(portfolioMetrics.deployedPct)}% deployed
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(portfolioMetrics.deployedPct, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Progress</span>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              Q{settings.currentQuarter} / 12
            </div>
            <div className="text-sm text-gray-600">
              {positions.length} of 12 positions
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {positions.filter(p => getPositionDetails(p).status === 'Complete').length} complete
            </div>
          </div>
        </div>

        {/* Multi-Bagger Tracker */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Multi-Bagger Tracker
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{portfolioMetrics.multiBaggers.tenX}</div>
              <div className="text-sm text-gray-600">10x+ Baggers</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600">{portfolioMetrics.multiBaggers.fiveX}</div>
              <div className="text-sm text-gray-600">5-10x Baggers</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{portfolioMetrics.multiBaggers.threeX}</div>
              <div className="text-sm text-gray-600">3-5x Baggers</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Current Quarter Actions */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-6 text-white mb-6">
              <h2 className="text-xl font-semibold mb-4">Current Quarter Actions (Q{settings.currentQuarter})</h2>
              {currentQuarterSchedule && currentQuarterSchedule.actions.length > 0 ? (
                <div className="space-y-3">
                  {currentQuarterSchedule.actions.map((action, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white bg-opacity-20 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          action.type === 'new' ? 'bg-green-400 text-green-900' : 'bg-blue-400 text-blue-900'
                        }`}>
                          {action.type === 'new' ? '🆕 NEW' : `➕ ADD #${action.installment}`}
                        </span>
                        <span className="font-semibold">{action.ticker}</span>
                      </div>
                      <span className="font-bold">{formatCurrency(action.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-white border-opacity-30 pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg">Total This Quarter:</span>
                      <span className="text-2xl font-bold">{formatCurrency(currentQuarterSchedule.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-white text-opacity-90">No scheduled investments this quarter</p>
              )}
            </div>

            {/* Positions Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Current Positions</h2>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Position
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invested</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Value</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit/Loss</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Return</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {positions.map(position => {
                      const details = getPositionDetails(position);
                      return (
                        <tr key={position.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{position.ticker}</div>
                            <div className="text-xs text-gray-500">{position.name}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              {details.totalShares.toFixed(2)} shares @ ${position.currentPrice}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                            {formatCurrency(details.totalInvested)}
                            <div className="text-xs text-gray-500">
                              {details.installmentsComplete}/3 installments
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                            {formatCurrency(details.currentValue)}
                          </td>
                          <td className={`px-6 py-4 text-right font-semibold ${details.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {details.profit >= 0 ? '+' : ''}{formatCurrency(details.profit)}
                            <div className="text-xs">
                              {details.returnPct >= 0 ? '+' : ''}{formatNumber(details.returnPct)}%
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-blue-600">
                            {formatNumber(details.multiple, 2)}x
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              details.status === 'Complete' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {details.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {details.status === 'Building' && (
                                <button
                                  onClick={() => handleAddInstallment(position.id)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Add Installment"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeletePosition(position.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upcoming Quarters */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Quarters</h3>
              <div className="space-y-3">
                {upcomingQuarters.map(quarter => (
                  <div key={quarter.quarter} className="border-l-4 border-blue-500 pl-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-900">Q{quarter.quarter}</span>
                      <span className="text-sm font-bold text-blue-600">{formatCurrency(quarter.totalAmount)}</span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      {quarter.actions.map((action, idx) => (
                        <div key={idx}>
                          {action.type === 'new' ? '🆕' : '➕'} {action.ticker}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Return Scenarios */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Return Scenarios
              </h3>
              <div className="space-y-3">
                {scenarios.map(scenario => {
                  const finalValue = settings.totalCapital * scenario.multiple;
                  const profit = finalValue - settings.totalCapital;
                  return (
                    <div key={scenario.name} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-gray-900">{scenario.name}</span>
                        <span className="text-xl font-bold text-gray-900">{scenario.multiple}x</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(finalValue)}
                      </div>
                      <div className="text-xs text-green-600 font-semibold">
                        +{formatCurrency(profit)} profit
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Settings */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Quarter</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={settings.currentQuarter}
                    onChange={(e) => setSettings({...settings, currentQuarter: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Add New Position</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker Symbol *</label>
                <input
                  type="text"
                  value={newPosition.ticker}
                  onChange={(e) => setNewPosition({...newPosition, ticker: e.target.value})}
                  placeholder="e.g., AAPL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newPosition.name}
                  onChange={(e) => setNewPosition({...newPosition, name: e.target.value})}
                  placeholder="e.g., Apple Inc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Quarter</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={newPosition.startQuarter}
                  onChange={(e) => setNewPosition({...newPosition, startQuarter: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shares Purchased *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPosition.shares}
                  onChange={(e) => setNewPosition({...newPosition, shares: e.target.value})}
                  placeholder="e.g., 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Per Share *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPosition.pricePerShare}
                  onChange={(e) => setNewPosition({...newPosition, pricePerShare: e.target.value})}
                  placeholder="e.g., 133.34"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPosition.currentPrice}
                  onChange={(e) => setNewPosition({...newPosition, currentPrice: e.target.value})}
                  placeholder="Leave empty to use purchase price"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPosition}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                Add Position
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
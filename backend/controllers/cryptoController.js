const CryptoHolding = require('../models/CryptoHolding');
const DefiPosition = require('../models/DefiPosition');
const { seedUserData } = require('../services/seedService');
const logger = require('../services/logger');

exports.getHoldings = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const holdings = await CryptoHolding.find({ userId: req.user._id }).sort({ value: -1 });

    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    const totalCost = holdings.reduce((s, h) => s + (h.avgCost * h.amount), 0);
    const unrealizedPL = totalValue - totalCost;
    const change24hTotal = holdings.reduce((s, h) => s + (h.value * h.change24h / 100), 0);

    // Recalculate allocation
    const formatted = holdings.map(h => ({
      id: h._id,
      symbol: h.symbol,
      name: h.name,
      icon: h.icon,
      amount: h.amount,
      avgCost: h.avgCost,
      currentPrice: h.currentPrice,
      value: h.value,
      change24h: h.change24h,
      allocation: totalValue > 0 ? Math.round((h.value / totalValue) * 1000) / 10 : 0,
      chain: h.chain,
      walletAddress: h.walletAddress,
      staked: h.staked,
      stakingApy: h.stakingApy,
      stakingRewards: h.stakingRewards
    }));

    res.json({
      success: true,
      data: {
        holdings: formatted,
        summary: {
          totalValue,
          totalCost,
          unrealizedPL,
          unrealizedPLPercent: totalCost > 0 ? Math.round((unrealizedPL / totalCost) * 1000) / 10 : 0,
          change24h: change24hTotal,
          change24hPercent: totalValue > 0 ? Math.round((change24hTotal / totalValue) * 1000) / 10 : 0,
          assetCount: holdings.length,
          totalStaked: holdings.reduce((s, h) => s + (h.staked * h.currentPrice), 0),
          totalRewards: holdings.reduce((s, h) => s + h.stakingRewards, 0)
        }
      }
    });
  } catch (error) {
    logger.error('getHoldings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holdings' });
  }
};

exports.getHolding = async (req, res) => {
  try {
    const holding = await CryptoHolding.findOne({ _id: req.params.id, userId: req.user._id });
    if (!holding) return res.status(404).json({ success: false, message: 'Holding not found' });
    res.json({ success: true, data: { holding } });
  } catch (error) {
    logger.error('getHolding error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holding' });
  }
};

exports.addHolding = async (req, res) => {
  try {
    const { symbol, name, amount, avgCost, currentPrice, chain } = req.body;
    if (!symbol || !name || !amount) {
      return res.status(400).json({ success: false, message: 'Symbol, name, and amount are required' });
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e15) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }
    if (avgCost !== undefined && (!Number.isFinite(Number(avgCost)) || Number(avgCost) < 0)) {
      return res.status(400).json({ success: false, message: 'Average cost must be a non-negative number' });
    }
    if (currentPrice !== undefined && (!Number.isFinite(Number(currentPrice)) || Number(currentPrice) < 0)) {
      return res.status(400).json({ success: false, message: 'Price must be a non-negative number' });
    }
    if (typeof symbol !== 'string' || symbol.length > 10 || !/^[A-Za-z0-9]+$/.test(symbol)) {
      return res.status(400).json({ success: false, message: 'Invalid symbol format' });
    }

    const existing = await CryptoHolding.findOne({ userId: req.user._id, symbol: symbol.toUpperCase() });
    if (existing) {
      // Update existing holding
      const totalCost = (existing.avgCost * existing.amount) + ((avgCost || currentPrice || 0) * amount);
      existing.amount += amount;
      existing.avgCost = existing.amount > 0 ? totalCost / existing.amount : 0;
      existing.currentPrice = currentPrice || existing.currentPrice;
      existing.value = existing.amount * existing.currentPrice;
      existing.chain = chain || existing.chain;
      await existing.save();
      return res.json({ success: true, message: 'Holding updated', data: { holding: existing } });
    }

    const price = currentPrice || 0;
    const holding = await CryptoHolding.create({
      userId: req.user._id,
      symbol: symbol.toUpperCase(),
      name,
      amount,
      avgCost: avgCost || price,
      currentPrice: price,
      value: amount * price,
      change24h: 0,
      chain: chain || 'Unknown'
    });

    res.status(201).json({ success: true, message: 'Holding added', data: { holding } });
  } catch (error) {
    logger.error('addHolding error:', error);
    res.status(500).json({ success: false, message: 'Failed to add holding' });
  }
};

exports.getPrices = async (req, res) => {
  try {
    // Return prices from stored holdings
    const holdings = await CryptoHolding.find({ userId: req.user._id }).select('symbol currentPrice change24h');
    const prices = {};
    holdings.forEach(h => {
      prices[h.symbol] = { price: h.currentPrice, change24h: h.change24h };
    });
    res.json({ success: true, data: { prices } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch prices' });
  }
};

exports.getTreasury = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const holdings = await CryptoHolding.find({ userId: req.user._id }).sort({ value: -1 });
    const defi = await DefiPosition.find({ userId: req.user._id, status: 'active' });

    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    const totalStaked = holdings.reduce((s, h) => s + (h.staked * h.currentPrice), 0);
    const totalDefiTVL = defi.reduce((s, d) => s + (d.currentValue || d.deposited), 0);
    const liquidReserves = totalValue - totalStaked;

    // XRP is primary treasury asset
    const xrp = holdings.find(h => h.symbol === 'XRP');

    // Reserve composition
    const composition = holdings.map(h => ({
      symbol: h.symbol,
      name: h.name,
      icon: h.icon,
      value: h.value,
      percentage: totalValue > 0 ? Math.round((h.value / totalValue) * 1000) / 10 : 0
    }));

    // Recent movements (simulated from order history)
    const TradingOrder = require('../models/TradingOrder');
    const recentOrders = await TradingOrder.find({ userId: req.user._id, status: 'filled' }).sort({ filledAt: -1 }).limit(5);

    const movements = recentOrders.map(o => ({
      type: o.side === 'buy' ? 'inflow' : 'outflow',
      amount: o.amount,
      symbol: o.pair.split('/')[0],
      description: `${o.side === 'buy' ? 'Purchase' : 'Sale'} - ${o.orderType}`,
      date: o.filledAt || o.createdAt
    }));

    res.json({
      success: true,
      data: {
        totalValue,
        change: 18.7,
        totalStaked,
        totalDefiTVL,
        liquidReserves,
        xrp: xrp ? {
          amount: xrp.amount,
          value: xrp.value,
          avgEntry: xrp.avgCost,
          currentPrice: xrp.currentPrice,
          pl: ((xrp.currentPrice - xrp.avgCost) / xrp.avgCost * 100).toFixed(1),
          staked: xrp.staked,
          stakedPercent: xrp.amount > 0 ? ((xrp.staked / xrp.amount) * 100).toFixed(1) : 0,
          liquid: xrp.amount - xrp.staked
        } : null,
        composition,
        movements
      }
    });
  } catch (error) {
    logger.error('getTreasury error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch treasury data' });
  }
};

exports.getDefi = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const positions = await DefiPosition.find({ userId: req.user._id }).sort({ currentValue: -1 });

    const active = positions.filter(p => p.status === 'active');
    const totalTVL = active.reduce((s, p) => s + (p.currentValue || p.deposited), 0);
    const totalRewards = active.reduce((s, p) => s + p.rewards, 0);
    const avgApy = active.length > 0 ? active.reduce((s, p) => s + p.apy, 0) / active.length : 0;

    res.json({
      success: true,
      data: {
        positions: active,
        summary: {
          totalTVL,
          totalRewards,
          avgApy: Math.round(avgApy * 10) / 10,
          activePositions: active.length,
          protocolCount: new Set(active.map(p => p.protocol)).size
        }
      }
    });
  } catch (error) {
    logger.error('getDefi error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch DeFi data' });
  }
};

exports.getDefiPositions = async (req, res) => {
  try {
    const positions = await DefiPosition.find({ userId: req.user._id, status: 'active' });
    res.json({ success: true, data: { positions } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch positions' });
  }
};

exports.harvestRewards = async (req, res) => {
  try {
    const position = await DefiPosition.findOne({ _id: req.params.id, userId: req.user._id });
    if (!position) return res.status(404).json({ success: false, message: 'Position not found' });

    const harvested = position.rewards;
    position.rewards = 0;
    await position.save();

    res.json({ success: true, message: `Harvested $${harvested.toFixed(2)} in rewards`, data: { harvested } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to harvest rewards' });
  }
};

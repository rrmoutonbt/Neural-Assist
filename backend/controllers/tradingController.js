const TradingOrder = require('../models/TradingOrder');
const CryptoHolding = require('../models/CryptoHolding');
const { seedUserData } = require('../services/seedService');
const logger = require('../services/logger');

// Generate synthetic order book from holdings + random depth
function generateOrderBook(basePrice) {
  const bids = Array.from({ length: 15 }, (_, i) => {
    const price = basePrice - (i + 1) * (0.001 + Math.random() * 0.009);
    const amount = 1000 + Math.random() * 99000;
    return { price: Math.round(price * 10000) / 10000, amount: Math.round(amount), total: 0 };
  });

  const asks = Array.from({ length: 15 }, (_, i) => {
    const price = basePrice + (i + 1) * (0.001 + Math.random() * 0.009);
    const amount = 1000 + Math.random() * 99000;
    return { price: Math.round(price * 10000) / 10000, amount: Math.round(amount), total: 0 };
  });

  let bidTotal = 0, askTotal = 0;
  bids.forEach(b => { bidTotal += b.amount; b.total = bidTotal; });
  asks.forEach(a => { askTotal += a.amount; a.total = askTotal; });

  return { bids, asks, spread: Math.round((asks[0].price - bids[0].price) * 10000) / 10000 };
}

function generateRecentTrades(basePrice, count = 30) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    price: Math.round((basePrice + (Math.random() - 0.5) * 0.2) * 10000) / 10000,
    amount: Math.round(100 + Math.random() * 49900),
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    time: new Date(now - i * (Math.random() * 120000)).toISOString()
  })).sort((a, b) => new Date(b.time) - new Date(a.time));
}

const PAIR_PRICES = {
  'XRP/USD': 2.52,
  'BTC/USD': 105230,
  'ETH/USD': 3850
};

exports.getOrderBook = async (req, res) => {
  try {
    const pair = req.params.base && req.params.quote ? `${req.params.base}/${req.params.quote}` : (req.params.pair || 'XRP/USD');
    const basePrice = PAIR_PRICES[pair] || 2.52;
    const orderBook = generateOrderBook(basePrice);
    res.json({ success: true, data: { pair, basePrice, ...orderBook } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order book' });
  }
};

exports.getRecentTrades = async (req, res) => {
  try {
    const pair = req.params.base && req.params.quote ? `${req.params.base}/${req.params.quote}` : (req.params.pair || 'XRP/USD');
    const basePrice = PAIR_PRICES[pair] || 2.52;
    const trades = generateRecentTrades(basePrice);
    res.json({ success: true, data: { pair, trades } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch trades' });
  }
};

const VALID_PAIRS = ['XRP/USD', 'BTC/USD', 'ETH/USD', 'SOL/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD', 'DOT/USD', 'LINK/USD', 'MATIC/USD', 'BNB/USD', 'LTC/USD'];
const VALID_ORDER_TYPES = ['market', 'limit', 'stop', 'stop_limit'];

exports.placeOrder = async (req, res) => {
  try {
    const { pair, side, orderType, price, amount } = req.body;

    if (!pair || !side || !price || !amount) {
      return res.status(400).json({ success: false, message: 'Pair, side, price, and amount are required' });
    }

    if (!['buy', 'sell'].includes(side)) {
      return res.status(400).json({ success: false, message: 'Side must be buy or sell' });
    }

    if (!VALID_PAIRS.includes(pair)) {
      return res.status(400).json({ success: false, message: 'Unsupported trading pair' });
    }

    if (orderType && !VALID_ORDER_TYPES.includes(orderType)) {
      return res.status(400).json({ success: false, message: 'Invalid order type' });
    }

    const numPrice = Number(price);
    const numAmount = Number(amount);
    if (!Number.isFinite(numPrice) || numPrice <= 0 || numPrice > 1e8) {
      return res.status(400).json({ success: false, message: 'Price must be a positive number' });
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e12) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    const total = numPrice * numAmount;
    const fee = Math.round(total * 0.001 * 100) / 100; // 0.1% fee

    // For market orders, fill immediately
    const isMarket = orderType === 'market';

    const order = await TradingOrder.create({
      userId: req.user._id,
      pair,
      side,
      orderType: orderType || 'limit',
      price,
      amount,
      total,
      filled: isMarket ? amount : 0,
      status: isMarket ? 'filled' : 'open',
      fee: isMarket ? fee : 0,
      filledAt: isMarket ? new Date() : undefined
    });

    // For market orders, update holdings
    if (isMarket) {
      const symbol = pair.split('/')[0];
      const holding = await CryptoHolding.findOne({ userId: req.user._id, symbol });

      if (side === 'buy' && holding) {
        const totalCost = (holding.avgCost * holding.amount) + (price * amount);
        holding.amount += amount;
        holding.avgCost = holding.amount > 0 ? totalCost / holding.amount : 0;
        holding.value = holding.amount * holding.currentPrice;
        await holding.save();
      } else if (side === 'sell' && holding) {
        holding.amount = Math.max(0, holding.amount - amount);
        holding.value = holding.amount * holding.currentPrice;
        await holding.save();
      }
    }

    res.status(201).json({
      success: true,
      message: isMarket ? 'Order filled' : 'Order placed',
      data: {
        order: {
          id: order._id,
          pair: order.pair,
          side: order.side,
          orderType: order.orderType,
          price: order.price,
          amount: order.amount,
          total: order.total,
          filled: order.filled,
          status: order.status,
          fee: order.fee,
          createdAt: order.createdAt
        }
      }
    });
  } catch (error) {
    logger.error('placeOrder error:', error);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await TradingOrder.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'open') return res.status(400).json({ success: false, message: 'Only open orders can be cancelled' });

    order.status = 'cancelled';
    await order.save();

    res.json({ success: true, message: 'Order cancelled', data: { orderId: order._id } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
};

exports.getOpenOrders = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const orders = await TradingOrder.find({ userId: req.user._id, status: 'open' }).sort({ createdAt: -1 });
    res.json({ success: true, data: { orders } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch open orders' });
  }
};

exports.getOrderHistory = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await TradingOrder.countDocuments({ userId: req.user._id });
    const orders = await TradingOrder.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        orders,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order history' });
  }
};

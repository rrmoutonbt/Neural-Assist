const CryptoHolding = require('../models/CryptoHolding');
const { seedUserData } = require('../services/seedService');
const logger = require('../services/logger');

exports.getWallets = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const holdings = await CryptoHolding.find({ userId: req.user._id }).sort({ value: -1 });

    const totalBalance = holdings.reduce((s, h) => s + h.value, 0);
    const totalStaked = holdings.reduce((s, h) => s + (h.staked * h.currentPrice), 0);
    const totalRewards = holdings.reduce((s, h) => s + h.stakingRewards, 0);

    res.json({
      success: true,
      data: {
        wallets: holdings.map(h => ({
          id: h._id,
          symbol: h.symbol,
          name: h.name,
          icon: h.icon,
          amount: h.amount,
          currentPrice: h.currentPrice,
          value: h.value,
          change24h: h.change24h,
          chain: h.chain,
          walletAddress: h.walletAddress,
          staked: h.staked,
          stakingApy: h.stakingApy,
          stakingRewards: h.stakingRewards
        })),
        summary: {
          totalBalance,
          totalStaked,
          totalRewards,
          assetCount: holdings.length
        }
      }
    });
  } catch (error) {
    logger.error('getWallets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallets' });
  }
};

exports.getWallet = async (req, res) => {
  try {
    const holding = await CryptoHolding.findOne({ _id: req.params.id, userId: req.user._id });
    if (!holding) return res.status(404).json({ success: false, message: 'Wallet not found' });
    res.json({ success: true, data: { wallet: holding } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
};

// Allowed crypto symbols whitelist
const VALID_SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOT', 'LINK', 'AVAX', 'MATIC', 'DOGE', 'BNB', 'LTC'];

// Basic wallet address format validation
function isValidAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 20 || addr.length > 128) return false;
  return /^[a-zA-Z0-9]+$/.test(addr);
}

exports.send = async (req, res) => {
  try {
    const { symbol, amount, toAddress } = req.body;

    if (!symbol || !amount || !toAddress) {
      return res.status(400).json({ success: false, message: 'Symbol, amount, and address are required' });
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e12) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    const upperSymbol = String(symbol).toUpperCase();
    if (!VALID_SYMBOLS.includes(upperSymbol)) {
      return res.status(400).json({ success: false, message: 'Unsupported symbol' });
    }

    if (!isValidAddress(toAddress)) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address format' });
    }

    const holding = await CryptoHolding.findOne({ userId: req.user._id, symbol: upperSymbol });
    if (!holding) return res.status(404).json({ success: false, message: 'Holding not found' });
    if (holding.amount < numAmount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

    holding.amount -= numAmount;
    holding.value = holding.amount * holding.currentPrice;
    await holding.save();

    res.json({
      success: true,
      message: `Sent ${numAmount} ${upperSymbol} to ${toAddress}`,
      data: {
        txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
        amount: numAmount,
        symbol: upperSymbol,
        toAddress,
        remainingBalance: holding.amount
      }
    });
  } catch (error) {
    logger.error('send error:', error);
    res.status(500).json({ success: false, message: 'Send failed' });
  }
};

exports.receive = async (req, res) => {
  try {
    const holding = await CryptoHolding.findOne({ _id: req.params.walletId, userId: req.user._id });
    if (!holding) return res.status(404).json({ success: false, message: 'Wallet not found' });

    res.json({
      success: true,
      data: {
        symbol: holding.symbol,
        chain: holding.chain,
        address: holding.walletAddress,
        qrData: `${holding.chain.toLowerCase()}:${holding.walletAddress}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get receive address' });
  }
};

exports.getStaking = async (req, res) => {
  try {
    await seedUserData(req.user._id);
    const holdings = await CryptoHolding.find({ userId: req.user._id, staked: { $gt: 0 } });

    const positions = holdings.map(h => ({
      id: h._id,
      symbol: h.symbol,
      name: h.name,
      icon: h.icon,
      staked: h.staked,
      stakedValue: h.staked * h.currentPrice,
      apy: h.stakingApy,
      rewards: h.stakingRewards,
      chain: h.chain
    }));

    const totalStaked = positions.reduce((s, p) => s + p.stakedValue, 0);
    const totalRewards = positions.reduce((s, p) => s + p.rewards, 0);

    res.json({
      success: true,
      data: {
        positions,
        summary: { totalStaked, totalRewards, positionCount: positions.length }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch staking' });
  }
};

exports.stake = async (req, res) => {
  try {
    const { symbol, amount } = req.body;
    const numAmount = Number(amount);
    if (!symbol || !Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e12) {
      return res.status(400).json({ success: false, message: 'Valid symbol and positive amount required' });
    }

    const upperSymbol = String(symbol).toUpperCase();
    if (!VALID_SYMBOLS.includes(upperSymbol)) {
      return res.status(400).json({ success: false, message: 'Unsupported symbol' });
    }

    const holding = await CryptoHolding.findOne({ userId: req.user._id, symbol: upperSymbol });
    if (!holding) return res.status(404).json({ success: false, message: 'Holding not found' });

    const available = holding.amount - holding.staked;
    if (available < numAmount) return res.status(400).json({ success: false, message: 'Insufficient available balance for staking' });

    holding.staked += numAmount;
    if (holding.stakingApy === 0) holding.stakingApy = 5.0; // Default APY
    await holding.save();

    res.json({
      success: true,
      message: `Staked ${numAmount} ${upperSymbol}`,
      data: { staked: holding.staked, available: holding.amount - holding.staked }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Staking failed' });
  }
};

exports.unstake = async (req, res) => {
  try {
    const { symbol, amount } = req.body;
    const numAmount = Number(amount);
    if (!symbol || !Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1e12) {
      return res.status(400).json({ success: false, message: 'Valid symbol and positive amount required' });
    }

    const upperSymbol = String(symbol).toUpperCase();
    if (!VALID_SYMBOLS.includes(upperSymbol)) {
      return res.status(400).json({ success: false, message: 'Unsupported symbol' });
    }

    const holding = await CryptoHolding.findOne({ userId: req.user._id, symbol: upperSymbol });
    if (!holding) return res.status(404).json({ success: false, message: 'Holding not found' });
    if (holding.staked < numAmount) return res.status(400).json({ success: false, message: 'Insufficient staked balance' });

    holding.staked -= numAmount;
    await holding.save();

    res.json({
      success: true,
      message: `Unstaked ${numAmount} ${upperSymbol}`,
      data: { staked: holding.staked, available: holding.amount - holding.staked }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unstaking failed' });
  }
};

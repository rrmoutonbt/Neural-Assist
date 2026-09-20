const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { seedUserData } = require('../services/seedService');
const logger = require('../services/logger');

exports.getAccounts = async (req, res) => {
  try {
    await seedUserData(req.user._id);

    const accounts = await Account.find({ userId: req.user._id }).sort({ createdAt: 1 });

    const formatted = accounts.map(acc => ({
      id: acc._id,
      name: acc.name,
      type: acc.type,
      balance: acc.balance,
      currency: acc.currency,
      status: acc.status,
      accountNumber: acc.getMaskedNumber(),
      routingNumber: '****' + acc.routingNumber.slice(-4),
      interestRate: acc.interestRate,
      createdAt: acc.createdAt
    }));

    res.json({ success: true, data: { accounts: formatted } });
  } catch (error) {
    logger.error('getAccounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch accounts' });
  }
};

exports.getAccount = async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({
      success: true,
      data: {
        account: {
          id: account._id,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
          status: account.status,
          accountNumber: account.getMaskedNumber(),
          routingNumber: '****' + account.routingNumber.slice(-4),
          interestRate: account.interestRate,
          createdAt: account.createdAt
        }
      }
    });
  } catch (error) {
    logger.error('getAccount error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch account' });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Name and type are required' });
    }

    const validTypes = ['checking', 'savings', 'investment', 'crypto_linked'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid account type' });
    }

    const accountNumber = String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

    const account = await Account.create({
      userId: req.user._id,
      name,
      type,
      balance: 0,
      accountNumber,
      interestRate: type === 'savings' ? 4.25 : 0
    });

    res.status(201).json({
      success: true,
      data: {
        account: {
          id: account._id,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
          status: account.status,
          accountNumber: account.getMaskedNumber(),
          interestRate: account.interestRate,
          createdAt: account.createdAt
        }
      }
    });
  } catch (error) {
    logger.error('createAccount error:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { accountId, type, status, page = 1, limit = 50 } = req.query;
    const query = { userId: req.user._id };

    if (accountId) query.accountId = accountId;
    if (type) query.type = type;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Transaction.countDocuments(query);

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('accountId', 'name accountNumber type');

    const formatted = transactions.map(txn => ({
      id: txn._id,
      type: txn.type,
      amount: txn.amount,
      currency: txn.currency,
      status: txn.status,
      description: txn.description,
      category: txn.category,
      reference: txn.reference,
      balanceAfter: txn.balanceAfter,
      accountName: txn.accountId?.name || 'Unknown',
      accountNumber: txn.accountId ? ('****' + txn.accountId.accountNumber.slice(-4)) : '',
      date: txn.createdAt
    }));

    // Compute summaries
    const allTxns = await Transaction.find({ userId: req.user._id });
    const deposits = allTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const withdrawals = allTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const transfers = allTxns.filter(t => t.type === 'transfer').length;

    res.json({
      success: true,
      data: {
        transactions: formatted,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: {
          totalDeposits: deposits,
          totalWithdrawals: withdrawals,
          transferCount: transfers,
          netFlow: deposits - withdrawals
        }
      }
    });
  } catch (error) {
    logger.error('getTransactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

exports.transfer = async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, memo } = req.body;

    if (!fromAccountId || !toAccountId || !amount) {
      return res.status(400).json({ success: false, message: 'From account, to account, and amount are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive' });
    }

    if (fromAccountId === toAccountId) {
      return res.status(400).json({ success: false, message: 'Cannot transfer to the same account' });
    }

    const fromAccount = await Account.findOne({ _id: fromAccountId, userId: req.user._id });
    const toAccount = await Account.findOne({ _id: toAccountId, userId: req.user._id });

    if (!fromAccount || !toAccount) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (fromAccount.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    // Update balances
    fromAccount.balance -= amount;
    toAccount.balance += amount;
    await fromAccount.save();
    await toAccount.save();

    const ref = `TRF-${Date.now().toString().slice(-6)}`;
    const description = memo || `Transfer to ${toAccount.name}`;

    // Create debit transaction
    await Transaction.create({
      userId: req.user._id,
      accountId: fromAccountId,
      type: 'transfer',
      amount: -amount,
      status: 'completed',
      description,
      category: 'transfer',
      reference: ref,
      balanceAfter: fromAccount.balance,
      relatedAccountId: toAccountId
    });

    // Create credit transaction
    await Transaction.create({
      userId: req.user._id,
      accountId: toAccountId,
      type: 'transfer',
      amount: amount,
      status: 'completed',
      description: memo || `Transfer from ${fromAccount.name}`,
      category: 'transfer',
      reference: ref,
      balanceAfter: toAccount.balance,
      relatedAccountId: fromAccountId
    });

    res.json({
      success: true,
      message: 'Transfer completed',
      data: {
        reference: ref,
        amount,
        from: { id: fromAccount._id, name: fromAccount.name, balance: fromAccount.balance },
        to: { id: toAccount._id, name: toAccount.name, balance: toAccount.balance }
      }
    });
  } catch (error) {
    logger.error('transfer error:', error);
    res.status(500).json({ success: false, message: 'Transfer failed' });
  }
};

exports.deposit = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const accountId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount required' });
    }

    const account = await Account.findOne({ _id: accountId, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    account.balance += amount;
    await account.save();

    const txn = await Transaction.create({
      userId: req.user._id,
      accountId,
      type: 'deposit',
      amount,
      status: 'completed',
      description: description || 'Deposit',
      category: 'income',
      reference: `DEP-${Date.now().toString().slice(-6)}`,
      balanceAfter: account.balance
    });

    res.json({
      success: true,
      message: 'Deposit completed',
      data: { transaction: txn, newBalance: account.balance }
    });
  } catch (error) {
    logger.error('deposit error:', error);
    res.status(500).json({ success: false, message: 'Deposit failed' });
  }
};

exports.resetAccounts = async (req, res) => {
  try {
    // Zero out all account balances for this user
    await Account.updateMany(
      { userId: req.user._id },
      { $set: { balance: 0 } }
    );

    // Clear all transactions for this user
    await Transaction.deleteMany({ userId: req.user._id });

    const accounts = await Account.find({ userId: req.user._id });

    res.json({
      success: true,
      message: 'All accounts zeroed and transaction history cleared',
      data: {
        accountsReset: accounts.length,
        accounts: accounts.map(a => ({
          id: a._id,
          name: a.name,
          type: a.type,
          balance: a.balance
        }))
      }
    });
  } catch (error) {
    logger.error('resetAccounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset accounts' });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const accountId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount required' });
    }

    const account = await Account.findOne({ _id: accountId, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (account.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient funds' });
    }

    account.balance -= amount;
    await account.save();

    const txn = await Transaction.create({
      userId: req.user._id,
      accountId,
      type: 'withdrawal',
      amount: -amount,
      status: 'completed',
      description: description || 'Withdrawal',
      category: 'expense',
      reference: `WTH-${Date.now().toString().slice(-6)}`,
      balanceAfter: account.balance
    });

    res.json({
      success: true,
      message: 'Withdrawal completed',
      data: { transaction: txn, newBalance: account.balance }
    });
  } catch (error) {
    logger.error('withdraw error:', error);
    res.status(500).json({ success: false, message: 'Withdrawal failed' });
  }
};

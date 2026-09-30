const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const logger = require('../services/logger');

exports.getAll = async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.user._id }).sort({ createdAt: -1 });

    const formatted = loans.map(loan => ({
      id: loan._id,
      type: loan.type,
      name: loan.name,
      loanNumber: loan.loanNumber,
      principalAmount: loan.principalAmount,
      currentBalance: loan.currentBalance,
      interestRate: loan.interestRate,
      monthlyPayment: loan.monthlyPayment,
      termMonths: loan.termMonths,
      status: loan.status,
      startDate: loan.startDate,
      maturityDate: loan.maturityDate,
      paymentCount: loan.payments.length,
      totalPaid: loan.payments.reduce((s, p) => s + p.amount, 0),
      percentPaid: ((1 - loan.currentBalance / loan.principalAmount) * 100).toFixed(1)
    }));

    res.json({ success: true, data: { loans: formatted } });
  } catch (error) {
    logger.error('getAll loans error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch loans' });
  }
};

exports.get = async (req, res) => {
  try {
    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    res.json({ success: true, data: { loan } });
  } catch (error) {
    logger.error('get loan error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch loan' });
  }
};

exports.apply = async (req, res) => {
  try {
    const { type, name, amount, termMonths } = req.body;

    if (!type || !amount || !termMonths) {
      return res.status(400).json({ success: false, message: 'Type, amount, and term are required' });
    }

    const numAmount = Number(amount);
    const numTerm = Number(termMonths);
    if (!Number.isFinite(numAmount) || numAmount < 100 || numAmount > 10000000) {
      return res.status(400).json({ success: false, message: 'Loan amount must be between $100 and $10,000,000' });
    }
    if (!Number.isInteger(numTerm) || numTerm < 1 || numTerm > 360) {
      return res.status(400).json({ success: false, message: 'Term must be between 1 and 360 months' });
    }

    const validTypes = ['personal', 'auto', 'home_equity', 'mortgage', 'business'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid loan type' });
    }

    // Default interest rates by type
    const rates = { personal: 7.5, auto: 5.9, home_equity: 8.25, mortgage: 6.5, business: 9.0 };
    const rate = rates[type];

    // Calculate monthly payment (standard amortization formula)
    const monthlyRate = rate / 100 / 12;
    const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);

    const loanNumber = `LN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    const loan = await Loan.create({
      userId: req.user._id,
      type,
      name: name || `${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} Loan`,
      loanNumber,
      principalAmount: amount,
      currentBalance: amount,
      interestRate: rate,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      termMonths,
      status: 'active',
      startDate: new Date(),
      maturityDate: new Date(Date.now() + termMonths * 30 * 86400000),
      payments: []
    });

    res.status(201).json({
      success: true,
      message: 'Loan approved',
      data: {
        loan: {
          id: loan._id,
          type: loan.type,
          name: loan.name,
          loanNumber: loan.loanNumber,
          principalAmount: loan.principalAmount,
          currentBalance: loan.currentBalance,
          interestRate: loan.interestRate,
          monthlyPayment: loan.monthlyPayment,
          termMonths: loan.termMonths,
          status: loan.status,
          startDate: loan.startDate,
          maturityDate: loan.maturityDate,
          percentPaid: '0.0'
        }
      }
    });
  } catch (error) {
    logger.error('apply loan error:', error);
    res.status(500).json({ success: false, message: 'Loan application failed' });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const loan = await Loan.findOne({ _id: req.params.id, userId: req.user._id });
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    const payments = loan.payments.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    res.json({ success: true, data: { payments, loanName: loan.name, loanNumber: loan.loanNumber } });
  } catch (error) {
    logger.error('getPayments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payments' });
  }
};

exports.makePayment = async (req, res) => {
  try {
    const { amount, accountId } = req.body;
    const loanId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount required' });
    }

    const loan = await Loan.findOne({ _id: loanId, userId: req.user._id });
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    if (loan.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Loan is not active' });
    }

    const paymentAmount = Math.min(amount, loan.currentBalance);

    // Calculate interest/principal split
    const monthlyRate = loan.interestRate / 100 / 12;
    const interestPortion = Math.round(loan.currentBalance * monthlyRate * 100) / 100;
    const principalPortion = Math.round((paymentAmount - interestPortion) * 100) / 100;

    // Update loan
    loan.currentBalance = Math.max(0, loan.currentBalance - principalPortion);
    loan.payments.push({
      amount: paymentAmount,
      principal: Math.max(0, principalPortion),
      interest: Math.max(0, interestPortion),
      paidAt: new Date(),
      status: 'completed'
    });

    if (loan.currentBalance <= 0) {
      loan.status = 'paid_off';
    }

    await loan.save();

    // If accountId provided, debit the account and create a transaction
    if (accountId) {
      const account = await Account.findOne({ _id: accountId, userId: req.user._id });
      if (account && account.balance >= paymentAmount) {
        account.balance -= paymentAmount;
        await account.save();

        await Transaction.create({
          userId: req.user._id,
          accountId,
          type: 'payment',
          amount: -paymentAmount,
          status: 'completed',
          description: `Loan Payment - ${loan.name}`,
          category: 'expense',
          reference: `LPM-${Date.now().toString().slice(-6)}`,
          balanceAfter: account.balance
        });
      }
    }

    res.json({
      success: true,
      message: loan.status === 'paid_off' ? 'Loan paid off!' : 'Payment completed',
      data: {
        loanId: loan._id,
        paymentAmount,
        principal: Math.max(0, principalPortion),
        interest: Math.max(0, interestPortion),
        remainingBalance: loan.currentBalance,
        loanStatus: loan.status
      }
    });
  } catch (error) {
    logger.error('makePayment error:', error);
    res.status(500).json({ success: false, message: 'Payment failed' });
  }
};

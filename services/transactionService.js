const { VTUTransaction, Wallet, User, sequelize } = require("../models");

class TransactionService {
  /**
   * Securely initializes a financial transaction lock and registers the ledger record
   */
  async initialize({ userId, type, provider, serviceId, serviceName, beneficiary, faceValue, sellingPrice, requestId, extraFields = {} }) {
    const existingTx = await VTUTransaction.findOne({ where: { requestId } });
    if (existingTx) {
      return { isDuplicate: true, tx: existingTx };
    }

    const providerRequestId = requestId.split('-').slice(0, 4).join('-');
    const t = await sequelize.transaction();

    try {
      const wallet = await Wallet.findOne({
        where: { userId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!wallet) {
        await t.rollback();
        throw new Error("Wallet not found");
      }

      if (wallet.vtuBalance < sellingPrice) {
        await t.rollback();
        throw new Error("Insufficient wallet balance");
      }

      const initialBalance = wallet.vtuBalance;
      wallet.vtuBalance -= sellingPrice;
      await wallet.save({ transaction: t });

      const tx = await VTUTransaction.create({
        userId,
        type,
        provider,
        serviceId,
        serviceName,
        beneficiary,
        faceValue,
        sellingPrice,
        costPrice: faceValue,
        profit: 0,
        requestId,
        providerRequestId,
        status: 'pending',
        initialBalance,
        ...extraFields
      }, { transaction: t });

      await t.commit();
      return { isDuplicate: false, tx, providerRequestId, wallet };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Concurrency-safe balance reversal update using atomic increments
   */
  async processRefund(tx, wallet, sellingPrice) {
    await Wallet.increment('vtuBalance', { by: sellingPrice, where: { id: wallet.id } });
    await tx.update({ status: 'failed' });
  }

  /**
   * Resolves and formats consistent database states for standard client outputs
   */
  async getResponsePayload(txId) {
    const refreshed = await VTUTransaction.findByPk(txId);
    return {
      service: refreshed.serviceName,
      amount: refreshed.sellingPrice,
      status: refreshed.status,
      beneficiary: refreshed.beneficiary,
      token: refreshed.token || null,
      ref: refreshed.providerRef || 'N/A',
      createdAt: refreshed.createdAt
    };
  }
}

module.exports = new TransactionService();
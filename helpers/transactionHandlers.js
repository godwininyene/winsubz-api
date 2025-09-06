const { Coin, Giftcard } = require("./../models");
const fetchCryptoRate = require('./../utils/fetchCryptoRate');
const AppError = require("./../utils/appError");

async function handleCoinTransaction(assetId, usdAmount, transactionType, dbTransaction) {
  const asset = await Coin.findByPk(assetId, { transaction: dbTransaction });
  if (!asset) {
    throw new AppError("No coin found with that ID", "", 404);
  }

  const assetName = asset.coinName;
  const description =
    transactionType === "buy"
      ? `Purchase ${asset.coinName}`
      : `Sold ${asset.coinName}`;

  const assetRate = asset.coinRate;
  const amount = parseFloat(usdAmount) * assetRate;

  const liveRate = await fetchCryptoRate(asset.coinName);
  const coinAmount = usdAmount / liveRate;

  return {
    assetName,
    description,
    assetRate,
    amount,
    coinAmount,
  };
}

async function handleGiftcardTransaction(assetId, usdAmount, transactionType, dbTransaction) {
  const asset = await Giftcard.findByPk(assetId, { transaction: dbTransaction });
  if (!asset) {
    throw new AppError("No giftcard found with that ID", "", 404);
  }

  const assetName = asset.cardName;
  const description =
    transactionType === "buy"
      ? `Purchase ${asset.cardName} giftcard`
      : `Sold ${asset.cardName} giftcard`;

  const assetRate = asset.cardRate;
  const amount = parseFloat(usdAmount) * assetRate;

  return {
    assetName,
    description,
    assetRate,
    amount,
  };
}

module.exports = { handleCoinTransaction, handleGiftcardTransaction };

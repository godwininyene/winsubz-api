module.exports = async (coinName) => {
  if (!coinName) return;
  const id = coinName.toLowerCase();
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );

    if (!res.ok) throw new Error("Failed to fetch from CoinGecko");

    const data = await res.json();
    if (!data || !data[id]) {
      console.log("No pricing data found for this cryptocurrency.");
      return;
    }
    console.log('FETCHED!!');
    

    const priceInUSD = data[id].usd;
    return priceInUSD;
  } catch (err) {
    console.log("Failed to fetch crypto price", err);
    console.log("Failed to fetch current cryptocurrency rate");
  }
};

module.exports = {
  getCostPrice(apiResponse) {
    // /pay/ responses use `amountPaid`.
    // /verify/ responses (confirmed from real Gsubz payload) use `amount` instead.
    // Check both shapes, and a couple of nested variants just in case.
    const candidates = [
      apiResponse?.amountPaid,
      apiResponse?.amount_paid,
      apiResponse?.amount,                    // <-- confirmed: what /verify/ actually returns
      apiResponse?.api_response?.amountPaid,
      apiResponse?.api_response?.amount,
      apiResponse?.data?.amountPaid,
      apiResponse?.data?.amount,
    ];

    const found = candidates.find((val) => val !== undefined && val !== null && val !== 0 && val !== "");

    if (found !== undefined) {
      return Number(found);
    }

    // Nothing usable found anywhere — log the full raw shape so it's
    // actually visible for debugging, instead of silently defaulting to 0.
    console.error(
      "⚠️ getCostPrice: could not find amountPaid/amount in any expected location. Raw response:",
      JSON.stringify(apiResponse)
    );
    return 0;
  }
};

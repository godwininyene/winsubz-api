module.exports = {
  getCostPrice(apiResponse) {
    return apiResponse?.amountPaid || 0;
  }
};
const peyflex = require('./../providers/peyflex');
const gsubz = require("./../providers/gsubz");

/**
 * Global utility to extract cost price safely
 * @param {string} provider - 'peyflex' | 'gsubz'
 * @param {number} faceValue - The base retail price
 * @param {object} options - Extra fields needed by specific providers ({ type, service, apiResponse })
 */
function getCostPrice(provider, faceValue, options = {}) {
  switch (provider?.toLowerCase()) {
    case "peyflex":
      return peyflex.getCostPrice(options.type, faceValue, options.service);

    case "gsubz":
      return gsubz.getCostPrice(options.apiResponse);

    default:
      return faceValue;
  }
}

module.exports = getCostPrice;
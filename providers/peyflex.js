const DISCOUNTS = {
  electricity: 0.002,
  cable: {
    gotv: 0.005,
    dstv: 0.005,
    startimes: 0.01,
  },
  airtime: {
    mtn: 0.01,
    airtel: 0.014,
    glo: 0.02,
    "9mobile": 0.02,
  },
};

function getCostPrice(type, faceValue, service = null) {
  let discount = 0;

  if (type === "electricity") {
    discount = DISCOUNTS.electricity;
  } else if (type === "cable") {
    discount = DISCOUNTS.cable[service?.toLowerCase()] || 0;
  } else if (type === "airtime" || type === "data") { 
    // Assuming data shares airtime structure or falls back to 0 gracefully
    discount = DISCOUNTS.airtime[service?.toLowerCase()] || 0;
  }

  return Number((faceValue * (1 - discount)).toFixed(2));
}

module.exports = { getCostPrice };
const DISCO_MAPPING = {
  "ikeja-electric": 1,
  "eko-electric": 2,
  "abuja-electric": 3,
  "kano-electric": 4,
  "enugu-electric": 5,
  "port-harcourt-electric": 6,
  "ibadan-electric": 7,
  "kaduna-electric": 8,
  "jos-electric": 9,
  "benin-electric": 10,
  "yola-electric": 11
};

const METER_TYPE_MAPPING = {
  "prepaid": "Prepaid",   // If they expect integers, change these to 1 and 2 respectively
  "postpaid": "Postpaid"
};

module.exports = {
  getDiscoId: (planCode) => DISCO_MAPPING[planCode?.toLowerCase()] || planCode,
  getMeterType: (type) => METER_TYPE_MAPPING[type?.toLowerCase()] || type
};
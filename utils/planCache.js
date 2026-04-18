const axios = require('./../lib/axios')
// ⏱ simple in-memory cache (5 mins)
const planCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getCachedPlans = async (serviceID) => {
    const now = Date.now();

    if (
        planCache[serviceID] &&
        (now - planCache[serviceID].timestamp < CACHE_DURATION)
    ) {
        return planCache[serviceID].data;
    }

    const res = await axios.get(`api/plans?service=${serviceID}`);

    const plans = res.data.list;

    planCache[serviceID] = {
        data: plans,
        timestamp: now
    };

    return plans;
};

module.exports = getCachedPlans
const axios = require('axios')
// ⏱ simple in-memory cache (5 mins)
const planCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const BASE_URL = `${process.env.PEYFLEX_BASE_URL}/api`

const getCachedPlans = async (identifier) => {
    const now = Date.now();

    if (
        planCache[identifier] &&
        (now - planCache[identifier].timestamp < CACHE_DURATION)
    ) {
        return planCache[identifier].data;
    }

    const res = await axios.get(`${BASE_URL}/cable/plans/${identifier}/`);

     const plans = res.data.plans;

    planCache[identifier] = {
        data: plans,
        timestamp: now
    };

    return plans;
};

module.exports = getCachedPlans
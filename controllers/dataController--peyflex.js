const axios = require('../lib/axios');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const NETWORK_LOGOS = {
    mtn_gifting_data: `${process.env.APP_URL}/img/networks/mtn.jpeg`,
    mtn_data_share: `${process.env.APP_URL}/img/networks/mtn.jpeg`,
    glo_data: `${process.env.APP_URL}/img/networks/glo.jpg`,
    airtel_data: `${process.env.APP_URL}/img/networks/airtel.png`,
    airtel_gifting: `${process.env.APP_URL}/img/networks/airtel.png`,
    "9mobile_data": `${process.env.APP_URL}/img/networks/9mobile.jpg`,
    "9mobile_gifting": `${process.env.APP_URL}/img/networks/9mobile.jpg`,
};

function applyMarkup(amount) {
    let markup = 0;

    // Small plans (₦450 – ₦650)
    if (amount >= 450 && amount <= 650) {
        markup = 50; // pick any value between ₦30 – ₦70
    }

    // Medium plans (₦1,100 – ₦1,950)
    else if (amount >= 1100 && amount <= 1950) {
        markup = 100; // pick any value between ₦50 – ₦150
    }

    // Big plans (above ₦1,950)
    else if (amount > 1950) {
        markup = 200; // pick any value between ₦100 – ₦250
    }

     return amount + markup;

    // return {
    //     cost_price: amount,              // what Peyflex charges you
    //     markup,
    //     selling_price: amount + markup   // what your customer pays
    // };
}

function formatLabel(label, newAmount) {
    // Replace the price in label e.g. "N1650" -> "N1750"
    return label.replace(/N\d+/i, `N${newAmount}`);
}

function normalizeAmount(plan) {
    const labelPriceMatch = plan.label.match(/N(\d+)/i);

    if (!labelPriceMatch) return plan.amount;

    const labelAmount = parseInt(labelPriceMatch[1], 10);

    // If amount is 10x or 100x bigger than label, trust label
    if (plan.amount >= labelAmount * 10) {
        return labelAmount;
    }

    return plan.amount;
}



exports.getNetworksList = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get('api/data/networks/');
        const networks = result.data.networks;

        const enrichedNetworks = networks.map(net => ({
            ...net,
            logo: NETWORK_LOGOS[net.identifier] || "/images/networks/default.png"
        }));

        res.status(200).json({
            status: "success",
            data: { networks: enrichedNetworks }
        });
    } catch (err) {
        if (err.response) {
            // External API responded with an error
            return next(
                new AppError(
                    err.response.data?.message || 'External API error',
                    err.response.data || err.message,
                    err.response.status
                )
            );
        }

        if (err.request) {
            // API didn't respond (timeout, DNS, network error)
            return next(
                new AppError(
                    'External API did not respond',
                    'Service temporarily unavailable',
                    502
                )
            );
        }

        // Something else went wrong
        return next(err);
    }
});

// exports.getDataPlans = catchAsync(async (req, res, next) => {
//     try {
//         const result = await axios.get(`api/data/plans/?network=${req.query.network}`);
//         const plans = result.data.plans;

//         res.status(200).json({
//             status: "success",
//             data: {
//                 network: result.data.network,
//                 plans
//             }
//         });
//     } catch (err) {
//         if (err.response) {
//             return next(
//                 new AppError(err.response.data?.error || 'External API error', "", err.response.status)
//             );
//         }

//         if (err.request) {
//             return next(
//                 new AppError(
//                     'External API did not respond',
//                     'Service temporarily unavailable',
//                     502
//                 )
//             );
//         }

//         return next(err);
//     }
// });

exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`api/data/plans/?network=${req.query.network}`);
        const plans = result.data.plans;

        const formattedPlans = plans.map(plan => {
            const normalizedAmount = normalizeAmount(plan);
            const sellingPrice = applyMarkup(normalizedAmount);

            return {
                plan_code: plan.plan_code,
                amount: sellingPrice,
                label: formatLabel(plan.label, sellingPrice)
            };
        });

        res.status(200).json({
            status: "success",
            data: {
                network: result.data.network,
                plans: formattedPlans
            }
        });
    } catch (err) {
        if (err.response) {
            return next(
                new AppError(err.response.data?.error || 'External API error', "", err.response.status)
            );
        }

        if (err.request) {
            return next(
                new AppError(
                    'External API did not respond',
                    'Service temporarily unavailable',
                    502
                )
            );
        }

        return next(err);
    }
});

exports.buyData = catchAsync(async (req, res, next) => {
    const payload = {
        network: req.body.network,
        mobile_number: req.body.mobile_number,
        plan_code: req.body.plan_code
    }

    try {
        const result = await axios.post(`api/data/purchase/`,
            payload,
            {
                headers: {
                    Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.status(200).json({
            status: "success",
            data: {
            }
        });
    } catch (err) {
        console.log('LIVE ERROR!', err);

        if (err.response) {
            // return next(
            //     new AppError(err.response.data?.error || 'Something went wrong!', "", err.response.status)
            // );

            const apiData = err.response.data || {};

            // Peyflex sends errors in different shapes
            const message =
                apiData.error ||
                apiData.message ||
                apiData.msg ||
                'VTU request failed';

            return next(
                new AppError(message, apiData, err.response.status)
            );
        }

        if (err.request) {
            return next(
                new AppError(
                    'External API did not respond',
                    'Service temporarily unavailable',
                    502
                )
            );
        }

        return next(err);
    }
});

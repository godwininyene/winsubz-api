const axios = require('../lib/axios');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const NETWORK_LOGOS = {
    mtn: `${process.env.APP_URL}/img/networks/mtn.jpeg`,
    glo: `${process.env.APP_URL}/img/networks/glo.jpg`,
    airtel: `${process.env.APP_URL}/img/networks/airtel.png`,
    "9mobile": `${process.env.APP_URL}/img/networks/9mobile.jpg`,
};

exports.getNetworksList = catchAsync(async (req, res, next) => {
    console.log('FETCHING');
    
    try {
        const result = await axios.get('api/airtime/networks/');
        const networks = result.data.networks;

        const enrichedNetworks = networks.map(net => ({
            ...net,
            logo: NETWORK_LOGOS[net.id] || "/images/networks/default.png"
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

exports.buyAirtime = catchAsync(async (req, res, next) => {
    const payload = {
        network: req.body.network,
        mobile_number: req.body.mobile_number,
        amount: req.body.amount
    }

    try {
        const result = await axios.post(`api/airtime/topup/`,
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
        if (err.response) {
            return next(
                new AppError(err.response.data?.message || 'Something went wrong!', "", err.response.status)
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
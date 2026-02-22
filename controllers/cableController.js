const axios = require("../lib/axios");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.getDataPlans = catchAsync(async (req, res, next) => {
    try {
        const result = await axios.get(`api/plans?service=${req.query.service}`);

        const plans = result.data.list;

        // const formattedPlans = plans.map(plan => {
        //     return {
        //         serviceId: req.query.network,
        //         plan: plan.value,
        //         provider_amount: parseInt(plan.price),
        //         amount: applyMarkup(parseInt(plan.price)),
        //         label: plan.displayName
        //     };
        // });

        res.status(200).json({
            status: "success",
            data: {
                // network: result.data.network,
                // plans: formattedPlans
                plans
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

exports.buyCableSub = catchAsync(async (req, res, next) => {
    const { serviceID, phone, customerID, variation_code, requestId } = req.body;

    if (!requestId) return next(new AppError("Request ID is required", "", 400));
    if (!serviceID || !phone || !customerID  || !variation_code) {
        return next(new AppError("serviceID, phone, customerID and amount are required", "", 400));
    }
  // 🌐 Call provider
  let providerResponse;
  let success = false;
    const formData = new FormData();
    formData.append('serviceID', serviceID);
    formData.append('api', process.env.GSUBZ_API_KEY);
    formData.append('phone', phone);
    formData.append('customerID', customerID);
    formData.append('amount', ''); //API requires this to be passed as empty string
    if (variation_code) formData.append('variation_code', variation_code);
    formData.append('requestID', requestId);



    providerResponse = await axios.post(`api/pay/`, formData, {
        headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });

    console.log('PROVIDER RESPONSE', providerResponse);
    


    res.status(200).json({
        status: "success",
        data: {}
    })
})
// module.exports = (data = {}) => {
//     // ✅ Normalize code
//     let code = data.code;
//     if (typeof code === "number") code = code.toString();
//     if (!code) code = "";

//     // ✅ Normalize status
//     let status = data.status;

//     if (typeof status === "number") {
//         status = status === 1 ? "success" : "failed";
//     } else {
//         status = String(status || "").toLowerCase();
//     }

//     // ✅ Detect meanings
//     const isSuccessStatus =
//         status.includes("success") ||
//         status === "1";

//     const isFailedStatus =
//         status.includes("fail") ||
//         status.includes("error");

//     const isReversedStatus =
//         status.includes("reverse") ||
//         status.includes("reversed");

//     const isSuccessCode =
//         code === "200" || code === "0";

//     // 🔥 Extract provider reference (ALL known formats)
//     const providerRef =
//         data.transactionID ||
//         data.transaction_id ||
//         data.transID ||
//         data.reference ||
//         data.ref ||
//         data.content?.transactionID ||
//         data.content?.transID ||
//         data.content?.reference ||
//         null;

//     return {
//         code,
//         status,
//         isSuccessStatus,
//         isFailedStatus,
//         isReversedStatus,
//         isSuccessCode,
//         providerRef
//     };
// };


module.exports = (data = {}) => {
    // 1. Grab base fields from root
    let code = data.code;
    let status = data.status;
    
    // 2. Extract nested provider responses if they exist
    const nested = data.api_response || data.content || {};
    
    // 3. Fallback strategies for inconsistent providers
    if (!status && nested.status) status = nested.status;
    if (!code && nested.code) code = nested.code;

    // Normalize formatting
    if (typeof code === "number") code = code.toString();
    if (!code) code = "";
    status = String(status || "").toLowerCase();

    // Detect execution meaning flags safely
    const isSuccessStatus =
        status.includes("success") ||
        status.includes("successful") ||
        status === "1";

    const isFailedStatus =
        status.includes("fail") ||
        status.includes("error") ||
        status.includes("declined");

    const isReversedStatus =
        status.includes("reverse") ||
        status.includes("reversed");

    const isSuccessCode =
        code === "200" || code === "0";

    // Extract unique tracking identifiers across variants
    const providerRef =
        data.transactionID ||
        data.transaction_id ||
        data.transID ||
        data.reference ||
        data.ref ||
        nested.transactionID ||
        nested.transID ||
        nested.reference ||
        null;

    return {
        code,
        status,
        isSuccessStatus,
        isFailedStatus,
        isReversedStatus,
        isSuccessCode,
        providerRef
    };
};
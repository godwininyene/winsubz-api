module.exports = (data = {}) => {
    let code = data.code;

    if (typeof code === "number") code = code.toString();
    if (!code) code = "";

    let status = data.status;

    if (typeof status === "number") {
        status = status === 1 ? "success" : "failed";
    } else {
        status = String(status || "").toLowerCase();
    }

    const isSuccessStatus =
        status.includes("success") || status === "1";

    const isSuccessCode =
        code === "200" || code === "0";

    // 🔥 IMPROVED REF EXTRACTION
    const providerRef =
        data.transactionID ||
        data.transaction_id ||
        data.transID ||                  // 👈 sometimes providers use this
        data.reference ||                // 👈 fallback
        data.ref ||
        data.content?.transactionID ||
        data.content?.transID ||
        data.content?.reference ||
        null;

    return {
        code,
        status,
        isSuccessStatus,
        isSuccessCode,
        providerRef
    };
};
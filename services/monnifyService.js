const axios = require('axios');

class MonnifyService {
    constructor() {
        this.baseUrl = process.env.MONNIFY_BASE_URL;
        this.apiKey = process.env.MONNIFY_API_KEY;
        this.secretKey = process.env.MONNIFY_SECRET_KEY;
        this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
    }

    /**
     * 🔐 Centralized Access Token Generator
     */
    async getAccessToken() {
        try {
            const tokenString = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');
            const response = await axios.post(`${this.baseUrl}/api/v1/auth/login`, {}, {
                headers: { Authorization: `Basic ${tokenString}` }
            });
            return response.data.responseBody.accessToken;
        } catch (error) {
            console.error('Monnify Auth Token Failure:', error.response?.data || error.message);
            throw new Error('Failed authentication handshake with Monnify gateway.');
        }
    }

    /**
     * 💳 1. Initiate Checkout Payment (Card, USSD, Transfer)
     */
    async initiateCheckout({ amount, customerName, customerEmail, paymentReference }) {
        const token = await this.getAccessToken();
        const payload = {
            amount: Number(amount),
            customerName,
            customerEmail,
            paymentReference,
            paymentDescription: "Wallet Funding via Checkout",
            currencyCode: "NGN",
            contractCode: this.contractCode,
            redirectUrl: `${process.env.FRONTEND_URL}/user/payment-status`,
            paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"]
        };

        const response = await axios.post(
            `${this.baseUrl}/api/v1/merchant/transactions/init-transaction`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.responseBody;
    }

    /**
     * 🔍 2. Query/Verify Checkout Transaction Status
     */
    async verifyTransaction(paymentReference) {
        const token = await this.getAccessToken();
        const response = await axios.get(
            `${this.baseUrl}/api/v2/merchant/transactions/query`,
            {
                params: { paymentReference },
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        return response.data.responseBody;
    }

    /**
     * 🏦 3. Create Dedicated Reserved Virtual Accounts
     */
    async createReservedAccount({ userId, customerName, customerEmail, bvn, nin }) {
        const token = await this.getAccessToken();
        const payload = {
            accountReference: `winsubz-${userId}`,
            accountName: customerName,
            currencyCode: "NGN",
            contractCode: this.contractCode,
            customerEmail: customerEmail,
            customerName: customerName,
            getAllAvailableBanks: true
        };

        if (bvn) payload.bvn = bvn;
        if (nin) payload.nin = nin;

        const response = await axios.post(
            `${this.baseUrl}/api/v2/bank-transfer/reserved-accounts`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.responseBody;
    }

    /**
     * 💸 4. Outbound Instant Bank Transfer (Influencer Withdrawal Payout)
     */
    async initiateTransfer({ amount, reference, bankCode, accountNumber, accountName, narration }) {
        try {
            const token = await this.getAccessToken();
            const payload = {
                amount: parseFloat(amount),
                reference: reference, // Acts as Idempotency Key
                narration: narration || "Influencer Wallet Payout",
                destinationBankCode: bankCode,
                destinationAccountNumber: accountNumber,
                destinationAccountName: accountName,
                currency: "NGN",
                sourceAccountNumber: process.env.MONNIFY_SOURCE_WALLET_NUM // Your corporate payout wallet
            };

            const response = await axios.post(`${this.baseUrl}/api/v2/disbursements/single`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            return response.data;
        } catch (error) {
            console.error('Monnify Disbursement Api Error:', error.response?.data || error.message);
            return {
                requestSuccessful: false,
                responseMessage: error.response?.data?.responseMessage || 'Network Connection Error during disbursement link'
            };
        }
    }

    /**
     * 🏦 5. Get All Supported Banks
     * Fetches the complete list of banks along with their unique codes
     */
    async getAllSupportedBanks() {
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(`${this.baseUrl}/api/v1/banks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data.responseBody;
        } catch (error) {
            console.error('Monnify Get Banks Failure:', error.response?.data || error.message);
            throw new Error('Failed to retrieve bank list from Monnify.');
        }
    }

    /**
     * 🔍 6. Account Name Enquiry / Validation
     * Validates account details and resolves the real account name before saving
     */
    async nameEnquiry({ accountNumber, bankCode }) {
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(`${this.baseUrl}/api/v1/disbursements/account/validate`, {
                params: {
                    accountNumber,
                    bankCode
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            // Format to match your bankController: { requestSuccessful: true, responseBody: { accountName } }
            return response.data;
        } catch (error) {
            console.error('Monnify Name Enquiry Error:', error.response?.data || error.message);
            return {
                requestSuccessful: false,
                responseMessage: error.response?.data?.responseMessage || 'Network Connection Error during name enquiry'
            };
        }
    }
}

module.exports = new MonnifyService();
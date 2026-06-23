const axios = require('../lib/axios');
const rawAxios = require('axios');
/**
 * Standardizes outbound provider API communications
 */
class ProviderService {
  /**
   * Dispatches the API call to the appropriate vendor
   */
  async dispatch(provider, type, payload) {
    const method = `${provider.toLowerCase()}_${type.toLowerCase()}`;
    if (typeof this[method] !== "function") {
      throw new Error(`Provider method ${method} is not implemented.`);
    }
    return await this[method](payload);
  }

  // --- GSUBZ IMPLEMENTATIONS ---
  async gsubz_data(payload) {
    const formData = new FormData();
    formData.append('serviceID', payload.serviceId);
    formData.append("requestID", payload.providerRequestId);
    formData.append('plan', payload.plan);
    formData.append('phone', payload.phone);
    formData.append('amount', '');
    formData.append('api', process.env.GSUBZ_API_KEY);

    const res = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });
    return res.data;
  }

  async gsubz_airtime(payload) {
    const formData = new FormData();
    formData.append('serviceID', payload.serviceId);
    formData.append("requestID", payload.providerRequestId);
    formData.append('phone', payload.phone);
    formData.append('amount', String(payload.faceValue));
    formData.append('api', process.env.GSUBZ_API_KEY);

    const res = await axios.post(`api/pay/`, formData, {
      headers: { Authorization: `Bearer ${process.env.GSUBZ_API_KEY}` }
    });
    return res.data;
  }

  // --- PEYFLEX IMPLEMENTATIONS ---
  async peyflex_electricity(payload) {
    const res = await rawAxios.post(
      "https://client.peyflex.com.ng/api/electricity/subscribe/",
      {
        identifier: "electricity",
        meter: payload.meter,
        plan: payload.plan,
        amount: String(payload.faceValue),
        type: payload.type,
        phone: payload.phone
      },
      {
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  }

  async peyflex_cable(payload) {
    const rawAxios = require('axios');
    const res = await rawAxios.post(
      "https://client.peyflex.com.ng/api/cable/subscribe/",
      {
        identifier: payload.identifier,
        plan: payload.plan,
        iuc: payload.iuc,
        phone: payload.phone,
        amount: String(payload.amount)
      },
      {
        headers: {
          Authorization: `Token ${process.env.PEYFLEX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  }
}

module.exports = new ProviderService();
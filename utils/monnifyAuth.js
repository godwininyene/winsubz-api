const axios = require('axios');

const getMonnifyToken = async () => {
  const auth = Buffer.from(
    `${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`
  ).toString('base64');

  const res = await axios.post(
    `${process.env.MONNIFY_BASE_URL}/api/v1/auth/login`,
    {},
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  return res.data.responseBody.accessToken;
};

module.exports = getMonnifyToken;
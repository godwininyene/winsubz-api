const Axios=require("axios");
const axios = Axios.create({
    // baseURL:process.env.PEYFLEX_BASE_URL,
     baseURL:process.env.GSUBZ_BASE_URL,
    headers:{
        'X-Requested-with':'XMLHttpRequest'
    },
    withCredentials:true,
    withXSRFToken:true
});


module.exports = axios;
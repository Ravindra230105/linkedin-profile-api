require('dotenv').config();

const config = {
    env  : process.env.NODE_ENV || 'development',
    port : Number(process.env.PORT) || 3000,

    linkedin : {
        liAt       : process.env.LI_AT,
        jsessionId : process.env.JSESSIONID
    }
};

module.exports = config;

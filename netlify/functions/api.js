const serverless = require('serverless-http');
const app = require('../../app/server');

module.exports.handler = serverless(app);

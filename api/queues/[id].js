const { handleQueue } = require('../../lib/queue-api');

module.exports = async function handler(req, res) {
  return handleQueue(req, res, req.query.id);
};

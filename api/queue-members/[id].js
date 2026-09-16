const { handleMember } = require('../../lib/queue-api');

module.exports = async function handler(req, res) {
  return handleMember(req, res, req.query.id);
};

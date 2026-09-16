const { listQueues, createQueue } = require('../../lib/queue-api');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return listQueues(req, res);
  if (req.method === 'POST') return createQueue(req, res);
  return res.status(405).json({ error: 'Method not allowed.' });
};

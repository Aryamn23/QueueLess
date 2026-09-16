const express = require("express");
const path = require("path");
const { listQueues, createQueue, handleQueue, handleMember } = require("./lib/queue-api");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/api/queues", listQueues);
app.post("/api/queues", createQueue);
app.all("/api/queues/:id/members/remove", (req, res) => { req.query.action = "remove"; return handleQueue(req, res, req.params.id); });
app.all("/api/queues/:id/:action", (req, res) => { req.query.action = req.params.action; return handleQueue(req, res, req.params.id); });
app.all("/api/queues/:id", (req, res) => handleQueue(req, res, req.params.id));
app.all("/api/queue-members/:id", (req, res) => handleMember(req, res, req.params.id));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "code.html"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`QueueLess frontend running at http://localhost:${PORT}`);
});

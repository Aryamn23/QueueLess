const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

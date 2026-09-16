const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const outputDirectory = path.join(projectRoot, 'dist');

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, 'code.html'),
  path.join(outputDirectory, 'index.html')
);

console.log('QueueLess production files written to dist/');

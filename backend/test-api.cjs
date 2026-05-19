const http = require('http');

const data = JSON.stringify({
  projectName: "Test Extension",
  prompt: "Make a mock extension"
});

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/extensions/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let responseData = '';
  res.on('data', d => {
    responseData += d;
  });
  res.on('end', () => {
    console.log(responseData);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();

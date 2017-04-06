#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

fs.readFile('./webhookSecret', (openErr, file) => {
  if (openErr) {
    if (openErr.code === 'ENOENT') {
      return crypto.randomBytes(24, (err, buf) => {
        if (err) throw err;
        fs.writeFile('./webhookSecret', buf, err => {
          if (err) throw err;
          console.log(buf.toString('base64'));
        });
      });
    }
    throw openErr;
  }

  console.log(file.toString('base64'));
});

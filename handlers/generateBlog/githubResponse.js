const fs = require('fs');
const ghRequestParams = require('./githubRequestParams');
const https = require('https');
const path = require('path');
const tar = require('tar-stream');
const url = require('url');
const zlib = require('zlib');

module.exports = (res, dir, callback) => {
  if (res.statusCode >= 400) {
    return callback(new Error(`${res.statusCode}: ${res.statusMessage}`));
  }

  if (res.statusCode >= 300) {
    const opts = Object.assign(
      url.parse(res.headers.location),
      ghRequestParams
    );

    return https.get(opts, redir => module.exports(redir, dir, callback)).on('error', callback);
  }

  const extractStream = tar.extract();

  // tar.extract provides a stream for each file from the tarball
  extractStream.on('entry', (header, stream, callback) => {
    console.log(dir);
    console.log(JSON.stringify(header));
    // Stream the file to the tmp directory then request the next one
    stream.on('end', () => callback());
    if (header.type === 'directory') {
      return fs.mkdir(path.join(dir, 'src', header.name), callback);
    }
    stream.pipe(
      fs.createWriteStream(path.join(dir, 'src', header.name)).on('error', err => callback(err))
    );
  });

  extractStream.on('error', err => callback(err));
  extractStream.on('finish', callback);

  // results.archive is an http.ServerResponse
  res.pipe(zlib.createGunzip()).pipe(extractStream);
};

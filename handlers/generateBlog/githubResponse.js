/*
  Copyright 2017 Linux Academy

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

const fs = require('fs');
const ghRequestParams = require('./githubRequestParams');
const https = require('https');
const path = require('path');
const tar = require('tar-stream');
const url = require('url');
const { createGunzip } = require('zlib');

module.exports = (res, dir) => new Promise((resolve, reject) => {
  if (res.statusCode >= 400) {
    return reject(new Error(`${res.statusCode}: ${res.statusMessage}`));
  }

  if (res.statusCode >= 300) {
    const opts = Object.assign(
      url.parse(res.headers.location),
      ghRequestParams
    );

    return https.get(
      opts,
      redir => module.exports(redir, dir).then(resolve, reject)
    ).on('error', reject);
  }

  const extractStream = tar.extract();
  const unzip = createGunzip().on('error', reject);

  // tar.extract provides a stream for each file from the tarball
  extractStream.on('entry', (header, stream, callback) => {
    // Stream the file to the tmp directory then request the next one
    stream.on('end', () => callback());
    if (header.type === 'directory') {
      return fs.mkdir(path.join(dir, header.name), callback);
    }
    stream.pipe(
      fs.createWriteStream(path.join(dir, header.name))
        .on('error', err => callback(err))
    );
  });

  extractStream.on('error', reject);
  extractStream.on('finish', resolve);

  res.pipe(unzip).pipe(extractStream);
});

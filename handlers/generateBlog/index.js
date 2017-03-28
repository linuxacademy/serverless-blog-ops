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

const async = require('async');
const AWS = require('aws-sdk');
const fs = require('fs');
const ghRequestParams = require('./githubRequestParams');
const ghResponse = require('./githubResponse');
const https = require('https');
const path = require('path');
const spawn = require('child_process').spawn;
const url = require('url');

const buildSite = (dir, callback) => {
  fs.readdir(path.join(dir, 'src'), (err, contents) => {
    if (err) {
      return callback(err);
    }
    fs.readdir(path.join(dir, 'src', contents[0]), callback);
  });
};

const ensureDir = (dir, callback) => {
  fs.rmdir(dir, (err) => {
    if (err && err.code !== 'ENOENT') {
      return callback(err);
    }
    fs.mkdir(dir, callback);
  });
};

exports.handler = (event, context, awsCallback) => {
  // Name temp dir using username and repo name
  const dir = `/tmp/${event.Records.repository.full_name.replace('/', '_')}`;

  // URL to a *.tar.gz of the repository that triggered this
  const opts = Object.assign(
    url.parse(
      event.Records.repository.archive_url
        .replace('{archive_format}', 'tarball')
        .replace('{/ref}', '/master')
    ),
    ghRequestParams
  );

  // Make the temp dir and start our archive request at the same time
  async.auto({
    archive: callback => https.get(opts, res => callback(null, res)).on('error', callback),
    dir: callback => ensureDir(dir, callback),
    pub: [
      'dir',
      (res, callback) => fs.mkdir(path.join(dir, 'public'), callback),
    ],
    src: [
      'dir',
      (res, callback) => fs.mkdir(path.join(dir, 'src'), callback),
    ],
  }, (err, results) => {
    if (err) {
      return awsCallback(new Error(err));
    }

    ghResponse(results.archive, dir, () => buildSite(dir, awsCallback));
  });
};

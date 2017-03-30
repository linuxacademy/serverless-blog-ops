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
const find = require('find');
const fs = require('fs');
const ghRequestParams = require('./githubRequestParams');
const ghResponse = require('./githubResponse');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');

const s3 = new AWS.S3();

const buildSite = dir => new Promise((resolve, reject) =>
  fs.readdir(path.join(dir, 'src'), (err, contents) => {
    if (err) {
      return reject(err);
    }

    const source = path.join(dir, 'src', contents[0]);
    const dest = path.join(dir, 'public');
    const bin = path.join(__dirname, 'bin', 'hugo');
    const args = ['--theme=hugo_theme_robust', '-c', source, '-d', dest];
    const hugoProcess = spawn(bin, args);
    hugoProcess.on('close', code => (code === 0 ?
      resolve() :
      reject(new Error(`Hugo exited with code ${code}`))
    ));
    hugoProcess.stdout.on('data', data => console.log(`stdout:\n${data}`));
    hugoProcess.stderr.on('data', data => console.log(`stderr:\n${data}`));
  })
);

const bucketExists = bucketName => s3.headBucket({
  Bucket: bucketName
}).promise();

const createDir = (dir, callback) => fs.mkdtemp(dir, callback);

const loadTheme = themeDir => new Promise((resolve, reject) =>
  https.get(
    Object.assign(
      url.parse(
        'https://api.github.com/repos/dim0627/hugo_theme_robust/tarball/b8ce466'
      ),
      ghRequestParams
    ),
    res => ghResponse(res, themeDir)
      .then(() => fs.rename(
          path.join(themeDir, 'dim0627-hugo_theme_robust-b8ce466'),
          path.join(themeDir, 'hugo_theme_robust'),
          err => err ? reject(err) : resolve()
      ))
  )
);

const rollback = (err, bucketName) => s3.deleteBucket({
  Bucket: bucketName
}).promise().then(() => Promise.resolve(err));

const setupBucket = bucketName => s3.createBucket({
  Bucket: bucketName,
  ACL: 'public-read'
}).promise();

const uploadSite = (bucket, dir) => {
  const publicDir = path.join(dir, 'public');
  return new Promise((resolve, reject) =>
    find.file(publicDir, files =>
      Promise.all(
        files.map(file =>
          s3.putObject({
            Bucket: bucket,
            Key: path.relative(file, publicDir),
            ACL: 'public-read',
            Body: fs.createReadStream(file)
            // TODO: Cache controls
          }).promise()
        )
      ).then(resolve, reject)
    )
  );
};

exports.handler = (event, context, awsCallback) => {
  // Name temp dir using username and repo name
  const dirPrefix = `/tmp/${event.Records.repository.full_name.replace('/', '_')}`;

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
    dir: callback => createDir(dirPrefix, callback),
    lsBin: callback => fs.readdir(path.join(__dirname, 'bin'), (err, ls) => {
      console.log(ls);
      callback(err);
    }),
    pub: [
      'dir',
      (res, callback) => fs.mkdir(path.join(res.dir, 'public'), callback),
    ],
    src: [
      'dir',
      (res, callback) => fs.mkdir(path.join(res.dir, 'src'), callback),
    ],
  }, (err, results) => {
    if (err) {
      return awsCallback(err);
    }

    const { archive, dir } = results;
    const bucketName = `${process.env.SITE_BUCKET}-${event.Records.after}`;

    // If we can successfully get a HEAD for this bucket, it's already out there
    const existsPromise = bucketExists(bucketName).then(awsCallback);

    const buildPromise = existsPromise
      .catch(() => ghResponse(archive, path.join(dir, 'src')))
      .then(() => loadTheme(dir))
      .then(() => buildSite(dir))
      .then(() => setupBucket(bucketName))
      .then(() => uploadSite(bucketName, dir));

    buildPromise.then(() => awsCallback());
    buildPromise.catch(err => console.error(err));
    buildPromise.catch(() => rollback(err, bucketName)).then(awsCallback);
  });
};

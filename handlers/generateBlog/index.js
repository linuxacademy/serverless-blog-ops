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
const ghRequestParams = require('./github/requestParams');
const ghResponse = require('./github/response');
const https = require('https');
const mime = require('mime');
const path = require('path');
const { spawn } = require('child_process');
const url = require('url');
const validateGithubWebhook = require(
  'post-scheduler/lib/github/validateGithubWebhook'
);

const s3 = new AWS.S3();

const { invalidate } = require('./cloudfront');

const buildSite = dir => new Promise((resolve, reject) => {
  const source = path.join(dir, 'src');
  const dest = path.join(dir, 'public');
  const bin = path.join(__dirname, 'bin', 'hugo');
  const args = [
    '-s', source,
    '-d', dest,
    '-b', `//${process.env.SITE_URL}`,
  ];
  const hugoProcess = spawn(bin, args);
  hugoProcess.on('close', code => (code === 0 ?
    resolve() :
    reject(new Error(`Hugo exited with code ${code}`))
  ));
  hugoProcess.stdout.on('data', data => console.log(`stdout:\n${data}`));
  hugoProcess.stderr.on('data', data => console.log(`stderr:\n${data}`));
});

const createTmpDir = (dir, callback) => fs.mkdtemp(dir, callback);

const listAllFromBucket = (bucket, continuationToken) => s3.listObjectsV2({
  Bucket: bucket,
  ContinuationToken: continuationToken,
}).promise().then(data => (
  data.IsTruncated ?
    listAllFromBucket(bucket, data.NextContinuationToken)
      .then(continuation => data.Contents.concat(continuation)) :
    data.Contents
));

const moveArchiveDirToSrc = dir => new Promise((resolve, reject) =>
  fs.readdir(dir, (readErr, contents) => {
    if (readErr) {
      return reject(readErr);
    }

    const archiveDir = contents.find(entry => entry !== 'public');
    if (!archiveDir) {
      return reject(new Error('Archive failed to load'));
    }
    fs.rename(
      path.join(dir, archiveDir),
      path.join(dir, 'src'),
      mvErr => (mvErr ? reject(mvErr) : resolve())
    );
  })
);

const rollback = (bucket, versionMap) => s3.deleteObjects({
  Bucket: bucket,
  Delete: {
    Objects: Array.from(versionMap).map(file => ({
      Key: file[0],
      VersionId: file[1],
    })),
  },
}).promise();

const updateSite = (bucket, dir) => {
  const publicDir = path.join(dir, 'public');
  const versionMap = new Map();
  return new Promise((resolve, reject) =>
    find.file(publicDir, files =>
      Promise.all(
        files.map(file =>
          s3.putObject({
            Bucket: bucket,
            Key: path.relative(publicDir, file),
            ACL: 'public-read',
            Body: fs.createReadStream(file),
            ContentType: mime.lookup(file),
            // TODO: Cache controls
          }).promise().then(
            res => versionMap.set(path.relative(publicDir, file), res.VersionId),
            (err) => {
              console.error(`Failed to write ${path.relative(publicDir, file)}`);
              console.error(JSON.stringify(err));
              return Promise.reject(err);
            }
          )
        )
      ).then(() => console.log('pushed'))
      .then(() => listAllFromBucket(bucket)).then((content) => {
        // Find S3 keys that are no longer in our archive
        const keys = new Set(content.map(obj => obj.Key));
        files.forEach(file => keys.delete(path.relative(publicDir, file)));

        if (!keys.size) {
          return versionMap;
        }
        return s3.deleteObjects({
          Bucket: bucket,
          Delete: {
            Objects: Array.from(keys).map(key => ({ Key: key })),
          },
        }).promise().then((res) => {
          res.Deleted.forEach(
            obj => versionMap.set(obj.Key, obj.DeleteMarkerVersionId)
          );
          // This is the end of the success promise chain
          // updateSite resolves with versionMap
          // TODO: jsdoc all this
          return versionMap;
        }).catch( // Rollback on fail
          err => rollback(bucket, versionMap).then(() => Promise.reject(err))
        );
      })
      .then(resolve, reject)
    )
  );
};

exports.handler = (event, context, awsCallback) => {
  let body;
  if (typeof event.body === 'string') {
    try {
      body = JSON.parse(event.body);
    } catch (err) {
      return awsCallback(null, { statusCode: 400 });
    }
  } else if (typeof event.body === 'object') {
    body = event.body;
  } else {
    return awsCallback(null, { statusCode: 400 });
  }

  const validation = validateGithubWebhook(event);

  if (validation instanceof Error) {
    console.error(validation);
    return awsCallback(null, { body: validation.message, statusCode: 401 });
  }

  if (event.headers['X-GitHub-Event'] === 'ping') {
    return awsCallback(null, { statusCode: 204 });
  } else if (event.headers['X-GitHub-Event'] !== 'push') {
    return awsCallback(null, { body: 'Unsupported event', statusCode: 400 });
  }

  // Name temp dir using username and repo name
  const dirPrefix = `/tmp/${body.repository.full_name.replace('/', '_')}`;

  // URL to a *.tar.gz of the repository that triggered this
  const opts = Object.assign(
    url.parse(
      body.repository.archive_url
        .replace('{archive_format}', 'tarball')
        .replace('{/ref}', '/master')
    ),
    ghRequestParams(process.env.GITHUB_USER, process.env.GITHUB_PASSWORD)
  );

  // Make the temp dir and start our archive request at the same time
  async.auto({
    archive: callback => https.get(opts, res => callback(null, res)).on('error', callback),
    dir: callback => createTmpDir(dirPrefix, callback),
    pub: [
      'dir',
      (res, callback) => fs.mkdir(path.join(res.dir, 'public'), callback),
    ],
  }, (asyncErr, results) => {
    if (asyncErr) {
      return awsCallback(asyncErr);
    }

    const { archive, dir } = results;
    const bucketName = process.env.SITE_BUCKET;

    const buildPromise = ghResponse(archive, dir)
      .then(() => moveArchiveDirToSrc(dir))
      .then(() => buildSite(dir))
      .then(() => updateSite(bucketName, dir))
      .then(
        versionMap => invalidate(process.env.CLOUDFRONT_DISTRIBUTION, body.after)
          .then(() => awsCallback(null, { statusCode: 201 }))
          .catch(err => rollback(bucketName, versionMap).then(() => Promise.reject(err)))
      );

    buildPromise.catch(err => console.error(err));
    buildPromise.catch(
      err => invalidate(process.env.CLOUDFRONT_DISTRIBUTION, body.after)
        .then(() => awsCallback(err))
    );
  });
};

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
/* eslint no-param-reassign: ["error", { "ignorePropertyModificationsFor": ["t.context"] }] */
const { test } = require('ava');
const fs = require('fs');
const ghResponse = require('../../github/response');
const nock = require('nock');
const path = require('path');
const rimraf = require('rimraf');
const { Readable } = require('stream');

const expectedContents = {
  [path.join('1', '2.txt')]: '2\n',
  '3.md': 'Hello\n',
};

const fixturePath = path.normalize(
  path.join(__dirname, '..', 'fixtures', 'archive.tar.gz')
);

const tempDir = () => new Promise(
  (resolve, reject) => fs.mkdtemp(
    'sb-test',
    (err, folder) => (err ? reject(err) : resolve(folder))
  )
);

test('Should reject on http error', (t) => {
  t.plan(2);

  const response = Object.assign(
    new Readable({ read: () => t.fail('Tried to read body from error') }),
    { statusCode: 404 }
  );

  return t.throws(ghResponse(response, '/tmp'), Error)
    .then(err => t.regex(err.message, /^404:/));
});

test('Should follow redirects', (t) => {
  t.plan(1);

  const intercept = nock('https://example.com')
    .get('/')
    .replyWithFile(200, fixturePath);

  const response = Object.assign(
    new Readable({ read: () => t.fail('Tried to read body from redirect') }),
    {
      statusCode: 301,
      headers: { location: 'https://example.com/' },
    }
  );

  return tempDir().then((dir) => {
    t.context.tempDir = dir;
    return dir;
  }).then(dir => ghResponse(response, dir))
    .then(() => t.true(intercept.isDone()));
});

test('Should extract a tar.gz stream to a given dir', (t) => {
  const archiveStream = fs.createReadStream(fixturePath);

  return tempDir()
    .then((dir) => {
      t.context.tempDir = dir;
      return dir;
    })
    .then(dir => ghResponse(archiveStream, dir).then(
      () => new Promise(
        (resolve, reject) => fs.readdir(dir, (err, files) => {
          if (err) {
            return reject(err);
          }

          t.true(files.includes('1'));
          t.true(files.includes('3.md'));
          t.false(files.includes('2.txt'));
          resolve();
        })
      )
    ).then(
      () => new Promise(
        (resolve, reject) => fs.readdir(
          path.join(dir, '1'),
          (err, files) => {
            if (err) {
              return reject(err);
            }

            t.true(files.includes('2.txt'));
            t.false(files.includes('3.md'));
            resolve();
          }
        )
      )
    ).then(
      () => Promise.all(
        Object.keys(expectedContents).map(filename =>
          new Promise((resolve, reject) => fs.readFile(
            path.join(dir, filename),
            (err, file) => {
              if (err) {
                return reject(err);
              }

              t.is(expectedContents[filename], file.toString());
              resolve();
            }
          ))
        )
      )
    ));
});

// Clean up any created temp directories
test.afterEach.always(t => new Promise((resolve, reject) => {
  if (!t.context.tempDir) {
    return resolve();
  }
  rimraf(t.context.tempDir, err => (err ? reject(err) : resolve()));
}));

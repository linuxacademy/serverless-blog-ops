/* eslint no-param-reassign: ["error", { "ignorePropertyModificationsFor": ["t.context"] }] */
const { test } = require('ava');
const fs = require('fs');
const ghResponse = require('../../github/response');
const path = require('path');
const rimraf = require('rimraf');

const expectedContents = {
  [path.join('1', '2.txt')]: '2\n',
  '3.md': 'Hello\n',
};

test('Should extract a tar.gz stream to a given dir', (t) => {
  const archiveStream = fs.createReadStream(
    path.normalize(
      path.join(__dirname, '..', 'fixtures', 'archive.tar.gz')
    )
  );

  const tempDir = new Promise(
    (resolve, reject) => fs.mkdtemp(
      'sb-test',
      (err, folder) => (err ? reject(err) : resolve(folder))
    )
  );

  return tempDir
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

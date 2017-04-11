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
const { test } = require('ava');
const Chance = require('chance');
const crypto = require('crypto');
const ghRequestParams = require('../../github/requestParams');

test('Provide correct https.get parameters based on GitHub credentials', (t) => {
  t.plan(1);

  const seed = crypto.randomBytes(4).readUInt32LE();
  const chance = new Chance(seed);

  const user = chance.word();
  const password = chance.string();

  process.env.GITHUB_USER = user;
  process.env.GITHUB_PASSWORD = password;

  t.deepEqual(ghRequestParams(user, password), {
    auth: `${user}:${password}`,
    headers: {
      'User-Agent': 'Serverless Blog',
    },
  });
});

test('Provide https.get parameters without auth in absence of GitHub credentials', (t) => {
  t.plan(1);

  // Just in case these are set in the test environment
  delete process.env.GITHUB_USER;
  delete process.env.GITHUB_PASSWORD;

  t.deepEqual(ghRequestParams(), {
    headers: {
      'User-Agent': 'Serverless Blog',
    },
  });
});

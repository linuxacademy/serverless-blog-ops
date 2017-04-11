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

const { test } = require('ava');
const AWS = require('aws-sdk-mock');
const Chance = require('chance');
const crypto = require('crypto');
const { invalidate } = require('../cloudfront');

test('Should correctly pass given values to CloudFront invalidation endpoint', (t) => {
  const seed = crypto.randomBytes(4).readUInt32LE();
  const chance = new Chance(seed);

  const distribution = chance.string({
    length: 14,
    pool: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  });
  const hash = chance.hash();

  AWS.mock('CloudFront', 'createInvalidation', (params, callback) => {
    t.deepEqual(params, {
      DistributionId: distribution,
      InvalidationBatch: {
        CallerReference: hash,
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
      },
    });
    callback();
  });

  t.plan(1);
  return invalidate(distribution, hash);
});

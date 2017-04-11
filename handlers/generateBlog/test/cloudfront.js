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

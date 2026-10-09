import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('returns ok when the database answers', async () => {
    const service = new HealthService({
      ping: () => Promise.resolve(),
    });

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('fails the request when the database cannot be reached', async () => {
    const service = new HealthService({
      ping: () => Promise.reject(new Error('connect ECONNREFUSED')),
    });

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

import { redisConnectionFromUrl } from './redis-connection.js';

describe('redisConnectionFromUrl', () => {
  it('parses host and port', () => {
    expect(redisConnectionFromUrl('redis://127.0.0.1:6379')).toEqual({
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('parses password and TLS for rediss://', () => {
    expect(
      redisConnectionFromUrl('rediss://:p%40ss@kv.example:6380'),
    ).toEqual({
      host: 'kv.example',
      port: 6380,
      password: 'p@ss',
      maxRetriesPerRequest: null,
      tls: {},
    });
  });
});

require('dotenv').config({ path: '.env.test' });
process.env.SCIM_AUTH_TOKEN = 'test-token';

const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();
const AUTH = 'Bearer test-token';

afterAll(async () => {
  const { closePool } = require('../src/db');
  await closePool();
});

describe('GET /scim/v2/ServiceProviderConfig', () => {
  test('returns config with patch and filter support', async () => {
    const res = await request(app)
      .get('/scim/v2/ServiceProviderConfig')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig');
    expect(res.body.patch.supported).toBe(true);
    expect(res.body.filter.supported).toBe(true);
    expect(res.body.bulk.supported).toBe(false);
  });
});

describe('GET /scim/v2/ResourceTypes', () => {
  test('returns User and Group resource types', async () => {
    const res = await request(app)
      .get('/scim/v2/ResourceTypes')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
    const names = res.body.Resources.map((r) => r.name);
    expect(names).toContain('User');
    expect(names).toContain('Group');
  });
});

describe('GET /scim/v2/Schemas', () => {
  test('returns User and Group schemas', async () => {
    const res = await request(app)
      .get('/scim/v2/Schemas')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
    const ids = res.body.Resources.map((r) => r.id);
    expect(ids).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(ids).toContain('urn:ietf:params:scim:schemas:core:2.0:Group');
  });
});

describe('GET /health', () => {
  test('returns 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Authentication', () => {
  test('returns 401 with wrong token', async () => {
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer wrong-token');

    expect(res.status).toBe(401);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
  });

  test('returns 401 with no auth header', async () => {
    const res = await request(app).get('/scim/v2/Users');
    expect(res.status).toBe(401);
  });
});

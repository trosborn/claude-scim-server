require('dotenv').config({ path: '.env.test' });
process.env.SCIM_AUTH_TOKEN = 'test-token';

const request = require('supertest');
const createApp = require('../src/app');
const { clearDatabase } = require('./helpers');

const app = createApp();
const AUTH = 'Bearer test-token';

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  const { closePool } = require('../src/db');
  await closePool();
});

// ─── POST /scim/v2/Users ─────────────────────────────────────────────────────
describe('POST /scim/v2/Users', () => {
  test('creates a user and returns 201 with SCIM schema', async () => {
    const res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'jsmith@example.com',
        name: { givenName: 'John', familyName: 'Smith' },
        emails: [{ value: 'jsmith@example.com', primary: true, type: 'work' }],
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(res.body.userName).toBe('jsmith@example.com');
    expect(res.body.name.givenName).toBe('John');
    expect(res.body.name.familyName).toBe('Smith');
    expect(res.body.active).toBe(true);
    expect(res.body.id).toBeTruthy();
    expect(res.body.meta.resourceType).toBe('User');
    expect(res.body.meta.location).toMatch(/\/scim\/v2\/Users\//);
  });

  test('returns 409 for duplicate userName', async () => {
    const payload = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'dup@example.com',
    };
    await request(app).post('/scim/v2/Users').set('Authorization', AUTH).send(payload);
    const res = await request(app).post('/scim/v2/Users').set('Authorization', AUTH).send(payload);

    expect(res.status).toBe(409);
    expect(res.body.scimType).toBe('uniqueness');
  });

  test('returns 400 when userName is missing', async () => {
    const res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'] });

    expect(res.status).toBe(400);
  });

  test('returns 401 without auth header', async () => {
    const res = await request(app)
      .post('/scim/v2/Users')
      .send({ userName: 'x@example.com' });

    expect(res.status).toBe(401);
  });
});

// ─── GET /scim/v2/Users ──────────────────────────────────────────────────────
describe('GET /scim/v2/Users', () => {
  test('returns ListResponse with empty Resources when no users', async () => {
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res.body.Resources).toEqual([]);
    expect(res.body.totalResults).toBe(0);
    expect(res.body.startIndex).toBe(1);
  });

  test('returns created users', async () => {
    await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'a@example.com' });
    await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'b@example.com' });

    const res = await request(app).get('/scim/v2/Users').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
    expect(res.body.Resources).toHaveLength(2);
  });

  test('filters by userName eq', async () => {
    await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'find@example.com' });
    await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'other@example.com' });

    const res = await request(app)
      .get('/scim/v2/Users?filter=userName%20eq%20%22find%40example.com%22')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].userName).toBe('find@example.com');
  });

  test('paginates with startIndex and count', async () => {
    for (let i = 1; i <= 5; i++) {
      await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
        .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: `user${i}@example.com` });
    }

    const res = await request(app)
      .get('/scim/v2/Users?startIndex=2&count=2')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(5);
    expect(res.body.Resources).toHaveLength(2);
    expect(res.body.startIndex).toBe(2);
    expect(res.body.itemsPerPage).toBe(2);
  });
});

// ─── GET /scim/v2/Users/:id ──────────────────────────────────────────────────
describe('GET /scim/v2/Users/:id', () => {
  test('returns user by id', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'getme@example.com' });

    const res = await request(app)
      .get(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
    expect(res.body.userName).toBe('getme@example.com');
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/scim/v2/Users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
  });
});

// ─── PUT /scim/v2/Users/:id ──────────────────────────────────────────────────
describe('PUT /scim/v2/Users/:id', () => {
  test('replaces user attributes', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'put@example.com',
        name: { givenName: 'Old', familyName: 'Name' },
      });

    const res = await request(app)
      .put(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'put@example.com',
        name: { givenName: 'New', familyName: 'Name' },
        active: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.name.givenName).toBe('New');
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/scim/v2/Users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'x@example.com' });

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /scim/v2/Users/:id ────────────────────────────────────────────────
describe('PATCH /scim/v2/Users/:id', () => {
  test('deactivates a user', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'patch@example.com', active: true });

    const res = await request(app)
      .patch(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', value: { active: false } }],
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('replaces active via path', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'patchpath@example.com', active: true });

    const res = await request(app)
      .patch(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('returns 400 without PatchOp schema', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'bad@example.com' });

    const res = await request(app)
      .patch(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH)
      .send({ Operations: [] });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /scim/v2/Users/:id ───────────────────────────────────────────────
describe('DELETE /scim/v2/Users/:id', () => {
  test('deletes a user and returns 204', async () => {
    const create = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'del@example.com' });

    const del = await request(app)
      .delete(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH);

    expect(del.status).toBe(204);

    const get = await request(app)
      .get(`/scim/v2/Users/${create.body.id}`)
      .set('Authorization', AUTH);

    expect(get.status).toBe(404);
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/scim/v2/Users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
  });
});

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

async function createUser(userName = 'user@example.com') {
  const res = await request(app).post('/scim/v2/Users').set('Authorization', AUTH)
    .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName });
  return res.body;
}

async function createGroup(displayName = 'Test Group') {
  const res = await request(app).post('/scim/v2/Groups').set('Authorization', AUTH)
    .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'], displayName });
  return res.body;
}

// ─── POST /scim/v2/Groups ────────────────────────────────────────────────────
describe('POST /scim/v2/Groups', () => {
  test('creates a group and returns 201', async () => {
    const res = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Engineering',
      });

    expect(res.status).toBe(201);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:Group');
    expect(res.body.displayName).toBe('Engineering');
    expect(res.body.id).toBeTruthy();
    expect(res.body.members).toEqual([]);
    expect(res.body.meta.resourceType).toBe('Group');
  });

  test('creates a group with initial members', async () => {
    const user = await createUser('member@example.com');

    const res = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'With Members',
        members: [{ value: user.id, display: user.userName }],
      });

    expect(res.status).toBe(201);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].value).toBe(user.id);
  });

  test('returns 400 when displayName is missing', async () => {
    const res = await request(app)
      .post('/scim/v2/Groups')
      .set('Authorization', AUTH)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'] });

    expect(res.status).toBe(400);
  });
});

// ─── GET /scim/v2/Groups ─────────────────────────────────────────────────────
describe('GET /scim/v2/Groups', () => {
  test('returns empty ListResponse when no groups', async () => {
    const res = await request(app).get('/scim/v2/Groups').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.Resources).toEqual([]);
    expect(res.body.totalResults).toBe(0);
  });

  test('returns created groups with members', async () => {
    const user = await createUser();
    await request(app).post('/scim/v2/Groups').set('Authorization', AUTH).send({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      displayName: 'G1',
      members: [{ value: user.id }],
    });

    const res = await request(app).get('/scim/v2/Groups').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].members).toHaveLength(1);
  });

  test('filters by displayName eq', async () => {
    await createGroup('FindMe');
    await createGroup('OtherGroup');

    const res = await request(app)
      .get('/scim/v2/Groups?filter=displayName%20eq%20%22FindMe%22')
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].displayName).toBe('FindMe');
  });
});

// ─── GET /scim/v2/Groups/:id ─────────────────────────────────────────────────
describe('GET /scim/v2/Groups/:id', () => {
  test('returns group by id', async () => {
    const group = await createGroup('Specific');

    const res = await request(app)
      .get(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(group.id);
    expect(res.body.displayName).toBe('Specific');
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/scim/v2/Groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', AUTH);

    expect(res.status).toBe(404);
  });
});

// ─── PUT /scim/v2/Groups/:id ─────────────────────────────────────────────────
describe('PUT /scim/v2/Groups/:id', () => {
  test('replaces group name and members', async () => {
    const user = await createUser();
    const group = await createGroup('OldName');

    const res = await request(app)
      .put(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'NewName',
        members: [{ value: user.id }],
      });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('NewName');
    expect(res.body.members).toHaveLength(1);
  });
});

// ─── PATCH /scim/v2/Groups/:id ───────────────────────────────────────────────
describe('PATCH /scim/v2/Groups/:id', () => {
  test('adds a member via add op', async () => {
    const user = await createUser('addme@example.com');
    const group = await createGroup('PatchGroup');

    const res = await request(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'add', path: 'members', value: [{ value: user.id, display: user.userName }] },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].value).toBe(user.id);
  });

  test('removes a specific member via remove op with filter', async () => {
    const user = await createUser('removeme@example.com');
    const group = await createGroup('RemoveGroup');

    await request(app).patch(`/scim/v2/Groups/${group.id}`).set('Authorization', AUTH).send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'add', path: 'members', value: [{ value: user.id }] }],
    });

    const res = await request(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'remove', path: `members[value eq "${user.id}"]` },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(0);
  });

  test('replaces displayName via replace op', async () => {
    const group = await createGroup('Before');

    const res = await request(app)
      .patch(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'displayName', value: 'After' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('After');
  });
});

// ─── DELETE /scim/v2/Groups/:id ──────────────────────────────────────────────
describe('DELETE /scim/v2/Groups/:id', () => {
  test('deletes a group and returns 204', async () => {
    const group = await createGroup();

    const del = await request(app)
      .delete(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH);

    expect(del.status).toBe(204);

    const get = await request(app)
      .get(`/scim/v2/Groups/${group.id}`)
      .set('Authorization', AUTH);

    expect(get.status).toBe(404);
  });
});

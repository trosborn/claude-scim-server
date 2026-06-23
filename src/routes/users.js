const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const {
  userToScim,
  listResponse,
  scimError,
  parseFilter,
  filterFieldToColumn,
  SCIM_PATCH_SCHEMA,
} = require('../scim/schemas');

const router = Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ─── GET /scim/v2/Users ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const startIndex = Math.max(1, parseInt(req.query.startIndex, 10) || 1);
    const count = Math.min(Math.max(1, parseInt(req.query.count, 10) || 100), 200);
    const offset = startIndex - 1;
    const filter = req.query.filter;

    let whereClause = '';
    let whereParams = [];

    if (filter) {
      const parsed = parseFilter(filter);
      if (parsed) {
        const col = filterFieldToColumn(parsed.field);
        if (col) {
          whereParams.push(parsed.value);
          const paramIdx = whereParams.length;
          if (parsed.op === 'eq') {
            whereClause = `WHERE ${col} = $${paramIdx}`;
          } else if (parsed.op === 'co') {
            whereClause = `WHERE ${col} ILIKE $${paramIdx}`;
            whereParams[paramIdx - 1] = `%${parsed.value}%`;
          } else if (parsed.op === 'sw') {
            whereClause = `WHERE ${col} ILIKE $${paramIdx}`;
            whereParams[paramIdx - 1] = `${parsed.value}%`;
          }
        }
      }
    }

    const countParams = [...whereParams];
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      countParams
    );
    const totalResults = parseInt(countRows[0].count, 10);

    const dataParams = [...whereParams, count, offset];
    const countParamBase = whereParams.length;
    const { rows } = await db.query(
      `SELECT * FROM users ${whereClause} ORDER BY created_at ASC LIMIT $${countParamBase + 1} OFFSET $${countParamBase + 2}`,
      dataParams
    );

    const base = baseUrl(req);
    const resources = rows.map((u) => userToScim(u, base));

    res.status(200).json(listResponse(resources, totalResults, startIndex, count));
  } catch (err) {
    console.error('GET /Users error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── POST /scim/v2/Users ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (!body.userName) {
      return res.status(400).json(scimError(400, 'userName is required', 'invalidValue'));
    }

    const emails = Array.isArray(body.emails) ? body.emails : [];
    const primaryEmail = emails.find((e) => e.primary)?.value || emails[0]?.value || null;

    const { rows } = await db.query(
      `INSERT INTO users (username, external_id, first_name, last_name, display_name, email, active, raw_attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.userName,
        body.externalId || null,
        body.name?.givenName || null,
        body.name?.familyName || null,
        body.displayName || null,
        primaryEmail,
        body.active !== false,
        JSON.stringify(body),
      ]
    );

    const created = rows[0];
    // Test hook: override active in 201 response without changing stored value.
    // Set FORCE_POST_ACTIVE=true or FORCE_POST_ACTIVE=false on Render to run Test A / Test B.
    if (process.env.FORCE_POST_ACTIVE !== undefined) {
      created.active = process.env.FORCE_POST_ACTIVE !== 'false';
    }
    res.status(201).json(userToScim(created, baseUrl(req)));
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation on username
      return res.status(409).json(scimError(409, `User with userName '${req.body.userName}' already exists`, 'uniqueness'));
    }
    console.error('POST /Users error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── GET /scim/v2/Users/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json(scimError(404, `User ${req.params.id} not found`));
    }

    res.status(200).json(userToScim(rows[0], baseUrl(req)));
  } catch (err) {
    console.error('GET /Users/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── PUT /scim/v2/Users/:id (full replace) ──────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;

    if (!body.userName) {
      return res.status(400).json(scimError(400, 'userName is required', 'invalidValue'));
    }

    const emails = Array.isArray(body.emails) ? body.emails : [];
    const primaryEmail = emails.find((e) => e.primary)?.value || emails[0]?.value || null;

    const { rows } = await db.query(
      `UPDATE users
       SET username = $1, external_id = $2, first_name = $3, last_name = $4,
           display_name = $5, email = $6, active = $7, raw_attributes = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        body.userName,
        body.externalId || null,
        body.name?.givenName || null,
        body.name?.familyName || null,
        body.displayName || null,
        primaryEmail,
        body.active !== false,
        JSON.stringify(body),
        req.params.id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json(scimError(404, `User ${req.params.id} not found`));
    }

    res.status(200).json(userToScim(rows[0], baseUrl(req)));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json(scimError(409, `userName already in use`, 'uniqueness'));
    }
    console.error('PUT /Users/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── PATCH /scim/v2/Users/:id (partial update) ──────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const body = req.body;

    if (!body.schemas?.includes(SCIM_PATCH_SCHEMA)) {
      return res.status(400).json(scimError(400, 'Missing PatchOp schema', 'invalidSyntax'));
    }

    const operations = body.Operations || [];

    // Fetch current user
    const { rows: existing } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json(scimError(404, `User ${req.params.id} not found`));
    }

    let user = existing[0];

    for (const op of operations) {
      const opName = op.op?.toLowerCase();
      const path = op.path?.toLowerCase();
      const value = op.value;

      if (opName === 'replace') {
        if (path === 'active' || (value && typeof value === 'object' && 'active' in value)) {
          const newActive = path === 'active' ? value : value.active;
          user = (await db.query('UPDATE users SET active = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [newActive, user.id])).rows[0];
        } else if (path && value !== undefined) {
          user = await applyScimPathUpdate(user, path, value);
        } else if (!path && typeof value === 'object') {
          user = await applyObjectUpdate(user, value);
        }
      } else if (opName === 'add') {
        if (!path && typeof value === 'object') {
          user = await applyObjectUpdate(user, value);
        }
      } else if (opName === 'remove') {
        if (path === 'active') {
          user = (await db.query('UPDATE users SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *', [user.id])).rows[0];
        }
      }
    }

    res.status(200).json(userToScim(user, baseUrl(req)));
  } catch (err) {
    console.error('PATCH /Users/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

async function applyScimPathUpdate(user, path, value) {
  const updates = {};

  if (path === 'username' || path === 'userName') updates.username = value;
  else if (path === 'name.givenname' || path === 'name.givenName') updates.first_name = value;
  else if (path === 'name.familyname' || path === 'name.familyName') updates.last_name = value;
  else if (path === 'displayname' || path === 'displayName') updates.display_name = value;
  else if (path === 'externalid' || path === 'externalId') updates.external_id = value;
  else if (path === 'active') updates.active = value;

  return applyDbUpdates(user.id, updates);
}

async function applyObjectUpdate(user, valueObj) {
  const updates = {};

  if (valueObj.userName !== undefined) updates.username = valueObj.userName;
  if (valueObj.active !== undefined) updates.active = valueObj.active;
  if (valueObj.displayName !== undefined) updates.display_name = valueObj.displayName;
  if (valueObj.externalId !== undefined) updates.external_id = valueObj.externalId;
  if (valueObj.name?.givenName !== undefined) updates.first_name = valueObj.name.givenName;
  if (valueObj.name?.familyName !== undefined) updates.last_name = valueObj.name.familyName;

  if (Array.isArray(valueObj.emails)) {
    const primary = valueObj.emails.find((e) => e.primary)?.value || valueObj.emails[0]?.value;
    if (primary) updates.email = primary;
  }

  return applyDbUpdates(user.id, updates);
}

async function applyDbUpdates(userId, updates) {
  if (Object.keys(updates).length === 0) {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    return rows[0];
  }

  const setClauses = Object.keys(updates)
    .map((key, i) => `${key} = $${i + 1}`)
    .concat('updated_at = NOW()');
  const values = [...Object.values(updates), userId];

  const { rows } = await db.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0];
}

// ─── DELETE /scim/v2/Users/:id ──────────────────────────────────────────────
// Okta typically deactivates rather than deletes, but SCIM spec allows DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    if (rowCount === 0) {
      return res.status(404).json(scimError(404, `User ${req.params.id} not found`));
    }

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /Users/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

module.exports = router;

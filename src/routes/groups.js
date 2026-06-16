const { Router } = require('express');
const db = require('../db');
const {
  groupToScim,
  listResponse,
  scimError,
  parseFilter,
  SCIM_PATCH_SCHEMA,
} = require('../scim/schemas');

const router = Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function getGroupWithMembers(groupId) {
  const { rows: groups } = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
  if (groups.length === 0) return null;

  const { rows: members } = await db.query(
    `SELECT u.id as user_id, u.username, u.display_name
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  return { group: groups[0], members };
}

// ─── GET /scim/v2/Groups ─────────────────────────────────────────────────────
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
      if (parsed && parsed.field === 'displayname') {
        whereParams.push(
          parsed.op === 'eq' ? parsed.value :
          parsed.op === 'co' ? `%${parsed.value}%` :
          `${parsed.value}%`
        );
        whereClause = `WHERE display_name ${parsed.op === 'eq' ? '=' : 'ILIKE'} $1`;
      }
    }

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM groups ${whereClause}`,
      whereParams
    );
    const totalResults = parseInt(countRows[0].count, 10);

    const dataParams = [...whereParams, count, offset];
    const base = whereParams.length;
    const { rows: groups } = await db.query(
      `SELECT * FROM groups ${whereClause} ORDER BY created_at ASC LIMIT $${base + 1} OFFSET $${base + 2}`,
      dataParams
    );

    // Fetch members for all groups in one query
    const groupIds = groups.map((g) => g.id);
    let membersByGroup = {};

    if (groupIds.length > 0) {
      const { rows: allMembers } = await db.query(
        `SELECT gm.group_id, u.id as user_id, u.username, u.display_name
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ANY($1)`,
        [groupIds]
      );
      for (const m of allMembers) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
        membersByGroup[m.group_id].push(m);
      }
    }

    const base2 = baseUrl(req);
    const resources = groups.map((g) =>
      groupToScim(g, membersByGroup[g.id] || [], base2)
    );

    res.status(200).json(listResponse(resources, totalResults, startIndex, count));
  } catch (err) {
    console.error('GET /Groups error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── POST /scim/v2/Groups ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (!body.displayName) {
      return res.status(400).json(scimError(400, 'displayName is required', 'invalidValue'));
    }

    const { rows } = await db.query(
      `INSERT INTO groups (display_name, external_id) VALUES ($1, $2) RETURNING *`,
      [body.displayName, body.externalId || null]
    );
    const group = rows[0];

    // Add initial members if provided
    const members = Array.isArray(body.members) ? body.members : [];
    if (members.length > 0) {
      const memberInserts = members.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ${memberInserts} ON CONFLICT DO NOTHING`,
        [group.id, ...members.map((m) => m.value)]
      );
    }

    const result = await getGroupWithMembers(group.id);
    res.status(201).json(groupToScim(result.group, result.members, baseUrl(req)));
  } catch (err) {
    console.error('POST /Groups error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── GET /scim/v2/Groups/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await getGroupWithMembers(req.params.id);

    if (!result) {
      return res.status(404).json(scimError(404, `Group ${req.params.id} not found`));
    }

    res.status(200).json(groupToScim(result.group, result.members, baseUrl(req)));
  } catch (err) {
    console.error('GET /Groups/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── PUT /scim/v2/Groups/:id (full replace) ──────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;

    if (!body.displayName) {
      return res.status(400).json(scimError(400, 'displayName is required', 'invalidValue'));
    }

    const { rows } = await db.query(
      `UPDATE groups SET display_name = $1, external_id = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [body.displayName, body.externalId || null, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json(scimError(404, `Group ${req.params.id} not found`));
    }

    // Replace members: delete all, re-insert
    await db.query('DELETE FROM group_members WHERE group_id = $1', [req.params.id]);

    const members = Array.isArray(body.members) ? body.members : [];
    if (members.length > 0) {
      const memberInserts = members.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ${memberInserts} ON CONFLICT DO NOTHING`,
        [req.params.id, ...members.map((m) => m.value)]
      );
    }

    const result = await getGroupWithMembers(req.params.id);
    res.status(200).json(groupToScim(result.group, result.members, baseUrl(req)));
  } catch (err) {
    console.error('PUT /Groups/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── PATCH /scim/v2/Groups/:id ───────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const body = req.body;

    if (!body.schemas?.includes(SCIM_PATCH_SCHEMA)) {
      return res.status(400).json(scimError(400, 'Missing PatchOp schema', 'invalidSyntax'));
    }

    // Verify group exists
    const { rows: existing } = await db.query('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json(scimError(404, `Group ${req.params.id} not found`));
    }

    const operations = body.Operations || [];

    for (const op of operations) {
      const opName = op.op?.toLowerCase();
      const path = op.path?.toLowerCase();
      const value = op.value;

      if (opName === 'replace') {
        if (path === 'displayname' || path === 'displayName') {
          await db.query(
            'UPDATE groups SET display_name = $1, updated_at = NOW() WHERE id = $2',
            [value, req.params.id]
          );
        } else if (path === 'members') {
          await db.query('DELETE FROM group_members WHERE group_id = $1', [req.params.id]);
          const members = Array.isArray(value) ? value : [];
          if (members.length > 0) {
            await addGroupMembers(req.params.id, members);
          }
        } else if (!path && typeof value === 'object' && value.displayName) {
          await db.query(
            'UPDATE groups SET display_name = $1, updated_at = NOW() WHERE id = $2',
            [value.displayName, req.params.id]
          );
        }
      } else if (opName === 'add') {
        if (path === 'members' && Array.isArray(value)) {
          await addGroupMembers(req.params.id, value);
        }
      } else if (opName === 'remove') {
        if (path === 'members') {
          // SCIM filter: members[value eq "userId"]
          const memberMatch = op.path?.match(/members\[value eq "([^"]+)"\]/i);
          if (memberMatch) {
            await db.query(
              'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
              [req.params.id, memberMatch[1]]
            );
          } else {
            await db.query('DELETE FROM group_members WHERE group_id = $1', [req.params.id]);
          }
        }
      }
    }

    const result = await getGroupWithMembers(req.params.id);
    res.status(200).json(groupToScim(result.group, result.members, baseUrl(req)));
  } catch (err) {
    console.error('PATCH /Groups/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

// ─── DELETE /scim/v2/Groups/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM groups WHERE id = $1', [req.params.id]);

    if (rowCount === 0) {
      return res.status(404).json(scimError(404, `Group ${req.params.id} not found`));
    }

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /Groups/:id error:', err);
    res.status(500).json(scimError(500, 'Internal server error'));
  }
});

async function addGroupMembers(groupId, members) {
  if (members.length === 0) return;
  const memberInserts = members.map((_, i) => `($1, $${i + 2})`).join(', ');
  await db.query(
    `INSERT INTO group_members (group_id, user_id) VALUES ${memberInserts} ON CONFLICT DO NOTHING`,
    [groupId, ...members.map((m) => m.value)]
  );
}

module.exports = router;

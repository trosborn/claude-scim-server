/**
 * SCIM 2.0 schema constants and response builders.
 * Reference: RFC 7643 (schema) + RFC 7644 (protocol)
 */

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

/**
 * Convert a DB user row to a SCIM User resource.
 */
function userToScim(user, baseUrl) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.external_id || undefined,
    userName: user.username,
    name: {
      givenName: user.first_name || '',
      familyName: user.last_name || '',
      formatted: [user.first_name, user.last_name].filter(Boolean).join(' '),
    },
    displayName: user.display_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
    emails: user.email
      ? [{ value: user.email, primary: true, type: 'work' }]
      : [],
    active: user.active,
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at,
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

/**
 * Convert a DB group row (with optional members array) to a SCIM Group resource.
 */
function groupToScim(group, members, baseUrl) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: group.id,
    externalId: group.external_id || undefined,
    displayName: group.display_name,
    members: (members || []).map((m) => ({
      value: m.user_id || m.id,
      display: m.display_name || m.username,
      $ref: `${baseUrl}/scim/v2/Users/${m.user_id || m.id}`,
    })),
    meta: {
      resourceType: 'Group',
      created: group.created_at,
      lastModified: group.updated_at,
      location: `${baseUrl}/scim/v2/Groups/${group.id}`,
    },
  };
}

/**
 * Build a SCIM ListResponse envelope.
 */
function listResponse(resources, totalResults, startIndex, count) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

/**
 * Build a SCIM error response.
 */
function scimError(status, detail, scimType) {
  const body = {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    detail,
  };
  if (scimType) body.scimType = scimType;
  return body;
}

/**
 * Parse Okta-style SCIM filter expressions.
 * Supports: attr eq "value" | attr co "value" | attr sw "value"
 * Returns { field, op, value } or null.
 */
function parseFilter(filterStr) {
  if (!filterStr) return null;

  const match = filterStr.match(/^(\S+)\s+(eq|co|sw|ne|gt|ge|lt|le)\s+"([^"]*)"$/i);
  if (!match) return null;

  return {
    field: match[1].toLowerCase(),
    op: match[2].toLowerCase(),
    value: match[3],
  };
}

/**
 * Map a SCIM filter field name to a SQL column.
 * Returns { column, table } or null if unsupported.
 */
function filterFieldToColumn(field) {
  const map = {
    'username': 'username',
    'emails.value': 'email',
    'externalid': 'external_id',
    'active': 'active',
    'name.givenname': 'first_name',
    'name.familyname': 'last_name',
  };
  return map[field] || null;
}

module.exports = {
  SCIM_USER_SCHEMA,
  SCIM_GROUP_SCHEMA,
  SCIM_LIST_SCHEMA,
  SCIM_ERROR_SCHEMA,
  SCIM_PATCH_SCHEMA,
  userToScim,
  groupToScim,
  listResponse,
  scimError,
  parseFilter,
  filterFieldToColumn,
};

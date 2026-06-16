/**
 * SCIM 2.0 meta endpoints:
 * - GET /ServiceProviderConfig
 * - GET /ResourceTypes
 * - GET /Schemas
 *
 * These are required by the SCIM spec (RFC 7644 §4) and Okta uses them
 * to discover server capabilities during integration setup.
 */
const { Router } = require('express');

const router = Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ─── GET /scim/v2/ServiceProviderConfig ──────────────────────────────────────
router.get('/ServiceProviderConfig', (req, res) => {
  const base = baseUrl(req);
  res.status(200).json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: `${base}/`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication using OAuth 2.0 Bearer Token',
      },
    ],
    meta: {
      resourceType: 'ServiceProviderConfig',
      location: `${base}/scim/v2/ServiceProviderConfig`,
    },
  });
});

// ─── GET /scim/v2/ResourceTypes ──────────────────────────────────────────────
router.get('/ResourceTypes', (req, res) => {
  const base = baseUrl(req);
  res.status(200).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        description: 'User Account',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        schemaExtensions: [],
        meta: {
          resourceType: 'ResourceType',
          location: `${base}/scim/v2/ResourceTypes/User`,
        },
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        description: 'Group',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        schemaExtensions: [],
        meta: {
          resourceType: 'ResourceType',
          location: `${base}/scim/v2/ResourceTypes/Group`,
        },
      },
    ],
  });
});

// ─── GET /scim/v2/Schemas ────────────────────────────────────────────────────
router.get('/Schemas', (req, res) => {
  const base = baseUrl(req);
  res.status(200).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [userSchema(base), groupSchema(base)],
  });
});

router.get('/Schemas/urn:ietf:params:scim:schemas:core:2.0:User', (req, res) => {
  res.status(200).json(userSchema(baseUrl(req)));
});

router.get('/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group', (req, res) => {
  res.status(200).json(groupSchema(baseUrl(req)));
});

function userSchema(base) {
  return {
    id: 'urn:ietf:params:scim:schemas:core:2.0:User',
    name: 'User',
    description: 'User Account',
    attributes: [
      { name: 'userName', type: 'string', multiValued: false, required: true, uniqueness: 'server' },
      {
        name: 'name', type: 'complex', multiValued: false, required: false,
        subAttributes: [
          { name: 'givenName', type: 'string', multiValued: false },
          { name: 'familyName', type: 'string', multiValued: false },
          { name: 'formatted', type: 'string', multiValued: false },
        ],
      },
      { name: 'displayName', type: 'string', multiValued: false },
      { name: 'active', type: 'boolean', multiValued: false },
      { name: 'externalId', type: 'string', multiValued: false },
      {
        name: 'emails', type: 'complex', multiValued: true,
        subAttributes: [
          { name: 'value', type: 'string', multiValued: false },
          { name: 'type', type: 'string', multiValued: false },
          { name: 'primary', type: 'boolean', multiValued: false },
        ],
      },
    ],
    meta: {
      resourceType: 'Schema',
      location: `${base}/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User`,
    },
  };
}

function groupSchema(base) {
  return {
    id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
    name: 'Group',
    description: 'Group',
    attributes: [
      { name: 'displayName', type: 'string', multiValued: false, required: true },
      { name: 'externalId', type: 'string', multiValued: false },
      {
        name: 'members', type: 'complex', multiValued: true,
        subAttributes: [
          { name: 'value', type: 'string', multiValued: false },
          { name: '$ref', type: 'reference', multiValued: false },
          { name: 'display', type: 'string', multiValued: false },
        ],
      },
    ],
    meta: {
      resourceType: 'Schema',
      location: `${base}/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group`,
    },
  };
}

module.exports = router;

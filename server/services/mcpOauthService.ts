import crypto from 'node:crypto';
import type { Request } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type McpOauthClientRecord,
  type McpOauthCodeRecord,
  type McpOauthTokenRecord,
  type UserRecord,
} from '../config/db';
import type { AuthTokenPayload } from '../middleware/authMiddleware';
import {
  hashMcpToken,
  timingSafeHashMatch,
  validateOAuthRedirectUri,
  verifyPkceS256,
} from '../utils/businessLogic';
import { loginUser, type SafeUser } from './authService';
import { ServiceError } from './customerService';

export const OAUTH_CODE_TTL_SECONDS = 300; // 5 minutes
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
export const OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days

export interface SafeOAuthClient {
  id: number;
  name: string;
  client_id: string;
  redirect_uris: string[];
  created_by: number | null;
  is_active: boolean;
  created_at: string;
}

export class OAuthProtocolError extends Error {
  oauthError: string;
  statusCode: number;

  constructor(oauthError: string, description: string, statusCode = 400) {
    super(description);
    this.oauthError = oauthError;
    this.statusCode = statusCode;
  }
}

export function resolveAppBaseUrl(req?: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto =
      typeof forwardedProto === 'string' && forwardedProto.trim()
        ? forwardedProto.split(',')[0].trim()
        : req.protocol || 'http';
    const host = req.get('host');
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

function toMysqlUtcDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseRedirectUris(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function toSafeClient(record: McpOauthClientRecord): SafeOAuthClient {
  return {
    id: record.id,
    name: record.name,
    client_id: record.client_id,
    redirect_uris: [...record.redirect_uris],
    created_by: record.created_by,
    is_active: record.is_active,
    created_at: record.created_at,
  };
}

function mapMysqlClientRow(row: RowDataPacket): McpOauthClientRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    client_id: String(row.client_id),
    client_secret_hash: String(row.client_secret_hash),
    redirect_uris: parseRedirectUris(row.redirect_uris),
    created_by: row.created_by !== null && row.created_by !== undefined ? Number(row.created_by) : null,
    is_active: Boolean(Number(row.is_active)),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function listOAuthClients(): Promise<SafeOAuthClient[]> {
  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, name, client_id, client_secret_hash, redirect_uris, created_by, is_active, created_at
       FROM mcp_oauth_clients
       ORDER BY id DESC`
    );
    return rows.map((r) => toSafeClient(mapMysqlClientRow(r)));
  }

  return [...memoryStore.mcpOauthClients]
    .sort((a, b) => b.id - a.id)
    .map(toSafeClient);
}

export async function createOAuthClient(input: {
  name: string;
  redirectUri: string;
  createdBy: number;
}): Promise<{ client: SafeOAuthClient; clientSecret: string }> {
  const name = input.name?.trim();
  if (!name || name.length < 2 || name.length > 120) {
    throw new ServiceError('App label must be between 2 and 120 characters.', 400);
  }

  const validRedirectUri = validateOAuthRedirectUri(input.redirectUri);
  if (!validRedirectUri) {
    throw new ServiceError(
      'A valid HTTPS Redirect URI is required (or http://localhost for local testing, without URL fragments).',
      400
    );
  }

  const clientId = `gdit_cid_${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = `gdit_cs_${crypto.randomBytes(32).toString('base64url')}`;
  const clientSecretHash = hashMcpToken(clientSecret);
  const redirectUris = [validRedirectUri];

  if (isMysqlMode()) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO mcp_oauth_clients (name, client_id, client_secret_hash, redirect_uris, created_by, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name, clientId, clientSecretHash, JSON.stringify(redirectUris), input.createdBy]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, client_id, client_secret_hash, redirect_uris, created_by, is_active, created_at
       FROM mcp_oauth_clients WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return {
      client: toSafeClient(mapMysqlClientRow(rows[0])),
      clientSecret,
    };
  }

  const record: McpOauthClientRecord = {
    id: memoryStore.seq.mcpOauthClients++,
    name,
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    redirect_uris: redirectUris,
    created_by: input.createdBy,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  memoryStore.mcpOauthClients.push(record);

  return { client: toSafeClient(record), clientSecret };
}

export async function revokeOAuthClient(id: number): Promise<{ clientId: string; name: string }> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, client_id, is_active FROM mcp_oauth_clients WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row || !Number(row.is_active)) {
      throw new ServiceError('Active OAuth client not found.', 404);
    }
    const clientId = String(row.client_id);
    const name = String(row.name);

    await pool.execute(`UPDATE mcp_oauth_clients SET is_active = 0 WHERE id = ?`, [id]);
    await pool.execute(
      `UPDATE mcp_oauth_tokens SET revoked_at = UTC_TIMESTAMP() WHERE client_id = ? AND revoked_at IS NULL`,
      [clientId]
    );
    await pool.execute(
      `UPDATE mcp_oauth_codes SET used_at = UTC_TIMESTAMP() WHERE client_id = ? AND used_at IS NULL`,
      [clientId]
    );
    return { clientId, name };
  }

  const client = memoryStore.mcpOauthClients.find((c) => c.id === id && c.is_active);
  if (!client) {
    throw new ServiceError('Active OAuth client not found.', 404);
  }
  const nowIso = new Date().toISOString();
  client.is_active = false;

  for (const tok of memoryStore.mcpOauthTokens) {
    if (tok.client_id === client.client_id && !tok.revoked_at) {
      tok.revoked_at = nowIso;
    }
  }
  for (const code of memoryStore.mcpOauthCodes) {
    if (code.client_id === client.client_id && !code.used_at) {
      code.used_at = nowIso;
    }
  }

  return { clientId: client.client_id, name: client.name };
}

async function findActiveClientByClientId(clientId: string): Promise<McpOauthClientRecord | null> {
  const trimmed = (clientId || '').trim();
  if (!trimmed) return null;

  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, name, client_id, client_secret_hash, redirect_uris, created_by, is_active, created_at
       FROM mcp_oauth_clients
       WHERE client_id = ? AND is_active = 1
       LIMIT 1`,
      [trimmed]
    );
    return rows[0] ? mapMysqlClientRow(rows[0]) : null;
  }

  return (
    memoryStore.mcpOauthClients.find((c) => c.client_id === trimmed && c.is_active) ?? null
  );
}

export async function validateAuthorizationRequest(input: {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<{ client: SafeOAuthClient; redirectUri: string }> {
  const client = await findActiveClientByClientId(input.clientId);
  if (!client) {
    throw new OAuthProtocolError(
      'invalid_client',
      'Unknown or revoked OAuth client_id.',
      400
    );
  }

  const redirectUri = (input.redirectUri || '').trim();
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    throw new OAuthProtocolError(
      'invalid_request',
      'The redirect_uri does not match the registered redirect URI for this client.',
      400
    );
  }

  if (input.responseType !== 'code') {
    throw new OAuthProtocolError(
      'unsupported_response_type',
      'Only response_type=code is supported.',
      400
    );
  }

  const challenge = (input.codeChallenge || '').trim();
  if (!challenge || challenge.length < 43 || challenge.length > 128 || !/^[A-Za-z0-9_-]+$/.test(challenge)) {
    throw new OAuthProtocolError(
      'invalid_request',
      'A valid PKCE code_challenge is required.',
      400
    );
  }

  const method = (input.codeChallengeMethod || 'S256').trim();
  if (method !== 'S256') {
    throw new OAuthProtocolError(
      'invalid_request',
      'Only PKCE code_challenge_method=S256 is supported (OAuth 2.1).',
      400
    );
  }

  return { client: toSafeClient(client), redirectUri };
}

export async function authorizeUserAndIssueCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  identifier: string;
  password: string;
}): Promise<{ code: string; user: SafeUser; client: SafeOAuthClient }> {
  const { client, redirectUri } = await validateAuthorizationRequest({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    responseType: 'code',
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
  });

  // Verify user against existing MySQL users table with bcryptjs
  const { user } = await loginUser({
    identifier: input.identifier,
    password: input.password,
  });

  const rawCode = crypto.randomBytes(32).toString('base64url');
  const codeHash = hashMcpToken(rawCode);
  const expiresAt = new Date(Date.now() + OAUTH_CODE_TTL_SECONDS * 1000);

  if (isMysqlMode()) {
    await getPool().execute(
      `INSERT INTO mcp_oauth_codes
        (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        codeHash,
        client.client_id,
        user.id,
        redirectUri,
        input.codeChallenge.trim(),
        'S256',
        toMysqlUtcDatetime(expiresAt),
      ]
    );
  } else {
    const codeRecord: McpOauthCodeRecord = {
      code_hash: codeHash,
      client_id: client.client_id,
      user_id: user.id,
      redirect_uri: redirectUri,
      code_challenge: input.codeChallenge.trim(),
      code_challenge_method: 'S256',
      expires_at: expiresAt.toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    };
    memoryStore.mcpOauthCodes.push(codeRecord);
  }

  return { code: rawCode, user, client };
}

async function verifyConfidentialClient(
  clientId: string,
  clientSecret: string
): Promise<McpOauthClientRecord> {
  const client = await findActiveClientByClientId(clientId);
  if (!client || !timingSafeHashMatch(clientSecret, client.client_secret_hash)) {
    throw new OAuthProtocolError(
      'invalid_client',
      'Invalid client credentials.',
      401
    );
  }
  return client;
}

async function issueTokenPair(
  clientId: string,
  userId: number
): Promise<{
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}> {
  const accessToken = `gdit_oauth_${crypto.randomBytes(32).toString('base64url')}`;
  const refreshToken = `gdit_oauth_rt_${crypto.randomBytes(32).toString('base64url')}`;
  const accessHash = hashMcpToken(accessToken);
  const refreshHash = hashMcpToken(refreshToken);

  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshExpiresAt = new Date(nowMs + OAUTH_REFRESH_TOKEN_TTL_SECONDS * 1000);

  if (isMysqlMode()) {
    await getPool().execute(
      `INSERT INTO mcp_oauth_tokens
        (access_token_hash, refresh_token_hash, client_id, user_id, expires_at, refresh_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        accessHash,
        refreshHash,
        clientId,
        userId,
        toMysqlUtcDatetime(expiresAt),
        toMysqlUtcDatetime(refreshExpiresAt),
      ]
    );
  } else {
    const tokenRecord: McpOauthTokenRecord = {
      id: memoryStore.seq.mcpOauthTokens++,
      access_token_hash: accessHash,
      refresh_token_hash: refreshHash,
      client_id: clientId,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
      refresh_expires_at: refreshExpiresAt.toISOString(),
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    memoryStore.mcpOauthTokens.push(tokenRecord);
  }

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
  };
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}> {
  const client = await verifyConfidentialClient(input.clientId, input.clientSecret);

  const rawCode = (input.code || '').trim();
  const redirectUri = (input.redirectUri || '').trim();
  const codeVerifier = (input.codeVerifier || '').trim();

  if (!rawCode || !redirectUri || !codeVerifier) {
    throw new OAuthProtocolError(
      'invalid_request',
      'Missing required parameters: code, redirect_uri, and code_verifier are required.',
      400
    );
  }

  const codeHash = hashMcpToken(rawCode);

  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method,
              (expires_at > UTC_TIMESTAMP()) AS not_expired, used_at
       FROM mcp_oauth_codes
       WHERE code_hash = ?
       LIMIT 1`,
      [codeHash]
    );
    const row = rows[0];
    if (
      !row ||
      String(row.client_id) !== client.client_id ||
      String(row.redirect_uri) !== redirectUri ||
      !Number(row.not_expired) ||
      row.used_at !== null
    ) {
      throw new OAuthProtocolError('invalid_grant', 'Invalid, expired, or already used authorization code.', 400);
    }

    if (
      String(row.code_challenge_method) !== 'S256' ||
      !verifyPkceS256(codeVerifier, String(row.code_challenge))
    ) {
      throw new OAuthProtocolError('invalid_grant', 'PKCE code_verifier verification failed.', 400);
    }

    // Atomically mark single-use code as consumed to prevent concurrent replay
    const [consumeRes] = await pool.execute<ResultSetHeader>(
      `UPDATE mcp_oauth_codes
       SET used_at = UTC_TIMESTAMP()
       WHERE code_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
      [codeHash]
    );
    if (consumeRes.affectedRows !== 1) {
      throw new OAuthProtocolError('invalid_grant', 'Authorization code has already been used.', 400);
    }

    return issueTokenPair(client.client_id, Number(row.user_id));
  }

  const record = memoryStore.mcpOauthCodes.find((c) => c.code_hash === codeHash);
  if (
    !record ||
    record.client_id !== client.client_id ||
    record.redirect_uri !== redirectUri ||
    record.used_at !== null ||
    new Date(record.expires_at).getTime() <= Date.now()
  ) {
    throw new OAuthProtocolError('invalid_grant', 'Invalid, expired, or already used authorization code.', 400);
  }

  if (
    record.code_challenge_method !== 'S256' ||
    !verifyPkceS256(codeVerifier, record.code_challenge)
  ) {
    throw new OAuthProtocolError('invalid_grant', 'PKCE code_verifier verification failed.', 400);
  }

  record.used_at = new Date().toISOString();
  return issueTokenPair(client.client_id, record.user_id);
}

export async function refreshOAuthToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}> {
  const client = await verifyConfidentialClient(input.clientId, input.clientSecret);
  const rawRefresh = (input.refreshToken || '').trim();
  if (!rawRefresh) {
    throw new OAuthProtocolError('invalid_request', 'Missing refresh_token parameter.', 400);
  }

  const refreshHash = hashMcpToken(rawRefresh);

  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id
       FROM mcp_oauth_tokens
       WHERE refresh_token_hash = ?
         AND client_id = ?
         AND revoked_at IS NULL
         AND refresh_expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [refreshHash, client.client_id]
    );
    const row = rows[0];
    if (!row) {
      throw new OAuthProtocolError('invalid_grant', 'Invalid, expired, or revoked refresh token.', 400);
    }

    // Rotate refresh token atomically (OAuth 2.1 best practice)
    const [revokeRes] = await pool.execute<ResultSetHeader>(
      `UPDATE mcp_oauth_tokens
       SET revoked_at = UTC_TIMESTAMP()
       WHERE id = ? AND revoked_at IS NULL`,
      [Number(row.id)]
    );
    if (revokeRes.affectedRows !== 1) {
      throw new OAuthProtocolError('invalid_grant', 'Refresh token has already been used.', 400);
    }

    return issueTokenPair(client.client_id, Number(row.user_id));
  }

  const existing = memoryStore.mcpOauthTokens.find(
    (t) =>
      t.refresh_token_hash === refreshHash &&
      t.client_id === client.client_id &&
      !t.revoked_at &&
      new Date(t.refresh_expires_at).getTime() > Date.now()
  );
  if (!existing) {
    throw new OAuthProtocolError('invalid_grant', 'Invalid, expired, or revoked refresh token.', 400);
  }

  existing.revoked_at = new Date().toISOString();
  return issueTokenPair(client.client_id, existing.user_id);
}

export async function authenticateOAuthAccessToken(
  rawToken: string
): Promise<AuthTokenPayload | null> {
  const trimmed = (rawToken || '').trim();
  if (!trimmed.startsWith('gdit_oauth_')) {
    return null;
  }

  const accessHash = hashMcpToken(trimmed);

  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT u.id AS user_id, u.name, u.email, u.role
       FROM mcp_oauth_tokens t
       INNER JOIN mcp_oauth_clients c ON c.client_id = t.client_id
       INNER JOIN users u ON u.id = t.user_id
       WHERE t.access_token_hash = ?
         AND t.revoked_at IS NULL
         AND t.expires_at > UTC_TIMESTAMP()
         AND c.is_active = 1
       LIMIT 1`,
      [accessHash]
    );
    const row = rows[0];
    if (!row) return null;

    return {
      userId: Number(row.user_id),
      name: String(row.name),
      email: String(row.email),
      role: row.role as UserRecord['role'],
    };
  }

  const token = memoryStore.mcpOauthTokens.find(
    (t) =>
      t.access_token_hash === accessHash &&
      !t.revoked_at &&
      new Date(t.expires_at).getTime() > Date.now()
  );
  if (!token) return null;

  const client = memoryStore.mcpOauthClients.find(
    (c) => c.client_id === token.client_id && c.is_active
  );
  if (!client) return null;

  const user = memoryStore.users.find((u) => u.id === token.user_id);
  if (!user) return null;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

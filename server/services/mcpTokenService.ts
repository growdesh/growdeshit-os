import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type McpTokenRecord,
  type UserRecord,
} from '../config/db';
import { getJwtSecret, type AuthTokenPayload } from '../middleware/authMiddleware';
import { hashMcpToken } from '../utils/businessLogic';
import { ServiceError } from './customerService';

export interface SafeMcpToken {
  id: number;
  user_id: number;
  label: string;
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function toSafeToken(record: McpTokenRecord): SafeMcpToken {
  return {
    id: record.id,
    user_id: record.user_id,
    label: record.label,
    token_prefix: record.token_prefix,
    last_used_at: record.last_used_at,
    revoked_at: record.revoked_at,
    created_at: record.created_at,
  };
}

export async function listUserMcpTokens(userId: number): Promise<SafeMcpToken[]> {
  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, user_id, label, token_prefix, last_used_at, revoked_at, created_at
       FROM mcp_tokens
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );
    return rows as SafeMcpToken[];
  }

  return memoryStore.mcpTokens
    .filter((t) => t.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .map(toSafeToken);
}

export async function createMcpToken(
  userId: number,
  labelInput: string
): Promise<{ tokenRecord: SafeMcpToken; rawToken: string }> {
  const label = labelInput?.trim() || 'MCP Client Token';
  if (label.length > 100) {
    throw new ServiceError('Token label must be 100 characters or fewer.', 400);
  }

  const rawToken = `gdit_mcp_${crypto.randomBytes(24).toString('hex')}`;
  const tokenPrefix = rawToken.slice(0, 16);
  const tokenHash = hashMcpToken(rawToken);

  if (isMysqlMode()) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO mcp_tokens (user_id, label, token_prefix, token_hash)
       VALUES (?, ?, ?, ?)`,
      [userId, label, tokenPrefix, tokenHash]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, label, token_prefix, last_used_at, revoked_at, created_at
       FROM mcp_tokens WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return { tokenRecord: rows[0] as SafeMcpToken, rawToken };
  }

  const record: McpTokenRecord = {
    id: memoryStore.seq.mcpTokens++,
    user_id: userId,
    label,
    token_prefix: tokenPrefix,
    token_hash: tokenHash,
    last_used_at: null,
    revoked_at: null,
    created_at: new Date().toISOString(),
  };
  memoryStore.mcpTokens.push(record);

  return { tokenRecord: toSafeToken(record), rawToken };
}

export async function revokeMcpToken(userId: number, tokenId: number): Promise<void> {
  const nowIso = new Date().toISOString();

  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE mcp_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      [tokenId, userId]
    );
    if (result.affectedRows === 0) {
      throw new ServiceError('Active MCP token not found.', 404);
    }
    return;
  }

  const token = memoryStore.mcpTokens.find(
    (t) => t.id === tokenId && t.user_id === userId && !t.revoked_at
  );
  if (!token) {
    throw new ServiceError('Active MCP token not found.', 404);
  }
  token.revoked_at = nowIso;
}

export async function authenticateMcpBearerToken(
  rawToken: string
): Promise<AuthTokenPayload | null> {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('gdit_mcp_')) {
    const tokenHash = hashMcpToken(trimmed);

    if (isMysqlMode()) {
      const pool = getPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT t.id AS token_id, u.id AS user_id, u.name, u.email, u.role
         FROM mcp_tokens t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.revoked_at IS NULL
         LIMIT 1`,
        [tokenHash]
      );
      const row = rows[0];
      if (!row) return null;

      await pool.execute(
        'UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Number(row.token_id)]
      );

      return {
        userId: Number(row.user_id),
        name: String(row.name),
        email: String(row.email),
        role: row.role as UserRecord['role'],
      };
    }

    const token = memoryStore.mcpTokens.find(
      (t) => t.token_hash === tokenHash && !t.revoked_at
    );
    if (!token) return null;

    const user = memoryStore.users.find((u) => u.id === token.user_id);
    if (!user) return null;

    token.last_used_at = new Date().toISOString();
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  // Fallback: allow valid session JWT Bearer tokens as well
  try {
    const decoded = jwt.verify(trimmed, getJwtSecret()) as AuthTokenPayload;
    if (!decoded || typeof decoded.userId !== 'number' || !decoded.role) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

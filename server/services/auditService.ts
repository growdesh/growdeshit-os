import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type ActivityLogRecord,
} from '../config/db';
import type { AuthTokenPayload } from '../middleware/authMiddleware';
import {
  canViewAllAuditLogs,
  type ActivitySource,
  type UserRole,
} from '../utils/businessLogic';

export interface LogActivityInput {
  user_id?: number | null;
  user_name: string;
  user_role: UserRole | 'system';
  action: string;
  entity_type: string;
  entity_id: string;
  source: ActivitySource;
  details: string;
}

export async function logActivity(input: LogActivityInput): Promise<ActivityLogRecord> {
  const userId = input.user_id ?? null;
  const userName = input.user_name?.trim() || 'System';
  const userRole = input.user_role || 'system';
  const action = input.action.trim();
  const entityType = input.entity_type.trim();
  const entityId = String(input.entity_id ?? '').trim();
  const source: ActivitySource = input.source === 'MCP' ? 'MCP' : 'Web';
  const details = input.details.trim().slice(0, 1000);

  if (isMysqlMode()) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO activity_logs (user_id, user_name, user_role, action, entity_type, entity_id, source, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, userName, userRole, action, entityType, entityId, source, details]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM activity_logs WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    return rows[0] as ActivityLogRecord;
  }

  const record: ActivityLogRecord = {
    id: memoryStore.seq.activityLogs++,
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    source,
    details,
    created_at: new Date().toISOString(),
  };
  memoryStore.activityLogs.push(record);
  return record;
}

export async function listActivityLogs(
  filters: {
    search?: string;
    source?: string;
    entity_type?: string;
    limit?: number;
  },
  requester: AuthTokenPayload
): Promise<{ logs: ActivityLogRecord[]; scope: 'all' | 'personal' }> {
  const search = filters.search?.trim().toLowerCase() || '';
  const sourceFilter = filters.source?.trim() || '';
  const entityTypeFilter = filters.entity_type?.trim() || '';
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 300);
  const canViewAll = canViewAllAuditLogs(requester.role);

  if (isMysqlMode()) {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (!canViewAll) {
      conditions.push('(user_id = ? OR user_role = ?)');
      params.push(requester.userId, 'system');
    }
    if (sourceFilter === 'Web' || sourceFilter === 'MCP') {
      conditions.push('source = ?');
      params.push(sourceFilter);
    }
    if (entityTypeFilter && entityTypeFilter !== 'All') {
      conditions.push('entity_type = ?');
      params.push(entityTypeFilter);
    }
    if (search) {
      conditions.push(
        '(LOWER(user_name) LIKE ? OR LOWER(action) LIKE ? OR LOWER(entity_id) LIKE ? OR LOWER(details) LIKE ?)'
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT * FROM activity_logs ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
      params
    );

    return {
      logs: rows as ActivityLogRecord[],
      scope: canViewAll ? 'all' : 'personal',
    };
  }

  const logs = memoryStore.activityLogs
    .filter((entry) => {
      if (!canViewAll && entry.user_id !== requester.userId && entry.user_role !== 'system') {
        return false;
      }
      if ((sourceFilter === 'Web' || sourceFilter === 'MCP') && entry.source !== sourceFilter) {
        return false;
      }
      if (entityTypeFilter && entityTypeFilter !== 'All' && entry.entity_type !== entityTypeFilter) {
        return false;
      }
      if (search) {
        const matches =
          entry.user_name.toLowerCase().includes(search) ||
          entry.action.toLowerCase().includes(search) ||
          entry.entity_type.toLowerCase().includes(search) ||
          entry.entity_id.toLowerCase().includes(search) ||
          entry.details.toLowerCase().includes(search);
        if (!matches) return false;
      }
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .slice(0, limit);

  return {
    logs,
    scope: canViewAll ? 'all' : 'personal',
  };
}

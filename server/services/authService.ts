import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, isMysqlMode, memoryStore, type UserRecord } from '../config/db';
import { signAuthToken } from '../middleware/authMiddleware';
import { normalizeIdentifier, type UserRole } from '../utils/businessLogic';

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
}

function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.created_at,
  };
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function loginUser(input: {
  identifier: string;
  password: string;
}): Promise<{ token: string; user: SafeUser }> {
  const identifier = input.identifier?.trim();
  const password = input.password || '';

  if (!identifier || !password) {
    throw new AuthError('Email or phone and password are required.', 400);
  }

  const normalizedEmail = normalizeIdentifier(identifier);
  const normalizedPhoneDigits = identifier.replace(/[\s()-]/g, '');

  let found: UserRecord | undefined;
  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, name, email, phone, password_hash, role, created_at
       FROM users
       WHERE LOWER(email) = ?
          OR phone = ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
       LIMIT 1`,
      [normalizedEmail, identifier, normalizedPhoneDigits]
    );
    found = rows[0] as UserRecord | undefined;
  } else {
    found = memoryStore.users.find(
      (u) =>
        u.email.toLowerCase() === normalizedEmail ||
        u.phone === identifier ||
        u.phone.replace(/[\s()-]/g, '') === normalizedPhoneDigits
    );
  }

  if (!found) {
    throw new AuthError('Invalid credentials. Check your email/phone and password.', 401);
  }

  const isValid = await bcrypt.compare(password, found.password_hash);
  if (!isValid) {
    throw new AuthError('Invalid credentials. Check your email/phone and password.', 401);
  }

  const safeUser = toSafeUser(found);
  const token = signAuthToken({
    userId: safeUser.id,
    name: safeUser.name,
    email: safeUser.email,
    role: safeUser.role,
  });

  return { token, user: safeUser };
}

export async function getUserById(userId: number): Promise<SafeUser | null> {
  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const row = rows[0] as SafeUser | undefined;
    return row ?? null;
  }

  const user = memoryStore.users.find((u) => u.id === userId);
  return user ? toSafeUser(user) : null;
}

export async function listUsers(): Promise<SafeUser[]> {
  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at ASC'
    );
    return rows as SafeUser[];
  }

  return memoryStore.users.map(toSafeUser);
}

export async function createTeamMember(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}): Promise<SafeUser> {
  const name = input.name?.trim();
  const email = normalizeIdentifier(input.email || '');
  const phone = input.phone?.trim();
  const password = input.password || '';
  const role: UserRole = input.role === 'superadmin' ? 'superadmin' : 'employee';

  if (!name || name.length < 2) {
    throw new AuthError('Member name is required.', 400);
  }
  if (!email || !email.includes('@')) {
    throw new AuthError('Valid email address is required.', 400);
  }
  if (!phone || phone.length < 6) {
    throw new AuthError('Valid phone number is required.', 400);
  }
  if (password.length < 6) {
    throw new AuthError('Initial password must be at least 6 characters.', 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (isMysqlMode()) {
    const pool = getPool();
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE LOWER(email) = ? OR phone = ? LIMIT 1',
      [email, phone]
    );
    if (existing.length > 0) {
      throw new AuthError('A team member with this email or phone already exists.', 409);
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, passwordHash, role]
    );
    const created = await getUserById(result.insertId);
    if (!created) throw new AuthError('Failed to retrieve created user.', 500);
    return created;
  }

  const duplicate = memoryStore.users.find(
    (u) => u.email.toLowerCase() === email || u.phone === phone
  );
  if (duplicate) {
    throw new AuthError('A team member with this email or phone already exists.', 409);
  }

  const created: UserRecord = {
    id: memoryStore.seq.users++,
    name,
    email,
    phone,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString(),
  };
  memoryStore.users.push(created);
  return toSafeUser(created);
}

export async function deleteTeamMember(targetUserId: number, requesterId: number): Promise<void> {
  if (targetUserId === requesterId) {
    throw new AuthError('You cannot delete your own active account.', 400);
  }

  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM users WHERE id = ?', [
      targetUserId,
    ]);
    if (result.affectedRows === 0) {
      throw new AuthError('Team member not found.', 404);
    }
    return;
  }

  const index = memoryStore.users.findIndex((u) => u.id === targetUserId);
  if (index === -1) {
    throw new AuthError('Team member not found.', 404);
  }
  memoryStore.users.splice(index, 1);
}

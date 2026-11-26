import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import {
  AuthError,
  claimInitialSuperadmin,
  createTeamMember,
  deleteTeamMember,
  getSetupStatus,
  getUserById,
  listUsers,
  loginUser,
} from '../services/authService';

function handleAuthError(res: Response, error: unknown): void {
  if (error instanceof AuthError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[AuthController]', error);
  res.status(500).json({ error: 'Authentication service error.' });
}

export async function setupStatusHandler(_req: Request, res: Response): Promise<void> {
  try {
    const status = await getSetupStatus();
    res.json(status);
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function setupHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, password } = req.body || {};
    const result = await claimInitialSuperadmin({ name, email, phone, password });
    await logActivity({
      user_id: result.user.id,
      user_name: result.user.name,
      user_role: result.user.role,
      action: 'auth.workspace_initialized',
      entity_type: 'Team',
      entity_id: `USR-${result.user.id}`,
      source: 'Web',
      details: `Initialized workspace and created superadmin account (${result.user.email})`,
    });
    res.status(201).json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = req.body || {};
    const result = await loginUser({ identifier, password });
    await logActivity({
      user_id: result.user.id,
      user_name: result.user.name,
      user_role: result.user.role,
      action: 'auth.signed_in',
      entity_type: 'Auth',
      entity_id: `USR-${result.user.id}`,
      source: 'Web',
      details: `Signed in to GrowDeshIT OS (${result.user.role})`,
    });
    res.json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function meHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const user = await getUserById(req.user.userId);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function listUsersHandler(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function createUserHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, email, phone, password, role } = req.body || {};
    const user = await createTeamMember({ name, email, phone, password, role });
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'team.member_created',
        entity_type: 'Team',
        entity_id: `USR-${user.id}`,
        source: 'Web',
        details: `Added team member ${user.name} (${user.role})`,
      });
    }
    res.status(201).json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function deleteUserHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    await deleteTeamMember(targetId, req.user!.userId);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'team.member_deleted',
        entity_type: 'Team',
        entity_id: `USR-${targetId}`,
        source: 'Web',
        details: `Removed team account USR-${targetId}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleAuthError(res, error);
  }
}

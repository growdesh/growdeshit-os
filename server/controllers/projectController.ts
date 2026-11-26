import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import { ServiceError } from '../services/customerService';
import {
  addProjectNote,
  addProjectTask,
  createProject,
  deleteProject,
  deleteProjectNote,
  deleteProjectTask,
  getProjectById,
  listProjects,
  toggleProjectTask,
  updateProject,
} from '../services/projectService';
import { formatBdtPlain } from '../utils/businessLogic';

function handleServiceError(res: Response, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[ProjectController]', error);
  res.status(500).json({ error: 'Failed to process project request.' });
}

export async function listProjectsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const projects = await listProjects({ status, search, customerId });
    res.json({ projects });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function getProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const project = await getProjectById(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function createProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const project = await createProject(req.body || {});
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'project.created',
        entity_type: 'Project',
        entity_id: project.project_code,
        source: 'Web',
        details: `Created project "${project.title}" (Budget ${formatBdtPlain(project.budget)})`,
      });
    }
    res.status(201).json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function updateProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const project = await updateProject(id, req.body || {});
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'project.updated',
        entity_type: 'Project',
        entity_id: project.project_code,
        source: 'Web',
        details: `Updated "${project.title}" (Status: ${project.status}, Budget: ${formatBdtPlain(project.budget)})`,
      });
    }
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deleteProjectHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const existing = await getProjectById(id);
    await deleteProject(id);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'project.deleted',
        entity_type: 'Project',
        entity_id: existing?.project_code || `PRJ#${id}`,
        source: 'Web',
        details: `Deleted project ${existing?.project_code || `#${id}`}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function addTaskHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const task = await addProjectTask(projectId, req.body || {});
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'task.created',
        entity_type: 'Task',
        entity_id: `PRJ#${projectId}/TSK#${task.id}`,
        source: 'Web',
        details: `Added task "${task.title}" (Assigned: ${task.assignee_name})`,
      });
    }
    res.status(201).json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function toggleTaskHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(projectId) || !Number.isInteger(taskId)) {
      res.status(400).json({ error: 'Invalid project or task ID.' });
      return;
    }
    const task = await toggleProjectTask(projectId, taskId, Boolean(req.body?.is_completed));
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'task.toggled',
        entity_type: 'Task',
        entity_id: `PRJ#${projectId}/TSK#${task.id}`,
        source: 'Web',
        details: `Marked "${task.title}" as ${task.is_completed ? 'completed' : 'incomplete'}`,
      });
    }
    res.json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deleteTaskHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(projectId) || !Number.isInteger(taskId)) {
      res.status(400).json({ error: 'Invalid project or task ID.' });
      return;
    }
    await deleteProjectTask(projectId, taskId);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'task.deleted',
        entity_type: 'Task',
        entity_id: `PRJ#${projectId}/TSK#${taskId}`,
        source: 'Web',
        details: `Removed task #${taskId} from project #${projectId}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function addNoteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const note = await addProjectNote(projectId, {
      category: req.body?.category,
      content: req.body?.content,
      author_name: req.user?.name || 'Team Member',
      author_id: req.user?.userId ?? null,
    });
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'note.created',
        entity_type: 'Note',
        entity_id: `PRJ#${projectId}/NOTE#${note.id}`,
        source: 'Web',
        details: `Added ${note.category} note to project #${projectId}`,
      });
    }
    res.status(201).json({ note });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deleteNoteHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const noteId = Number(req.params.noteId);
    if (!Number.isInteger(projectId) || !Number.isInteger(noteId)) {
      res.status(400).json({ error: 'Invalid project or note ID.' });
      return;
    }
    await deleteProjectNote(projectId, noteId);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'note.deleted',
        entity_type: 'Note',
        entity_id: `PRJ#${projectId}/NOTE#${noteId}`,
        source: 'Web',
        details: `Deleted note #${noteId} from project #${projectId}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}

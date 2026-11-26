import { Router } from 'express';
import {
  createScheduleHandler,
  deleteScheduleHandler,
  listSchedulesHandler,
  markSchedulePaidHandler,
} from '../controllers/notificationController';
import {
  addNoteHandler,
  addTaskHandler,
  createProjectHandler,
  deleteNoteHandler,
  deleteProjectHandler,
  deleteTaskHandler,
  getProjectHandler,
  listProjectsHandler,
  toggleTaskHandler,
  updateProjectHandler,
} from '../controllers/projectController';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', listProjectsHandler);
router.get('/:id', getProjectHandler);
router.post('/', createProjectHandler);
router.put('/:id', updateProjectHandler);
router.delete('/:id', requireRole('superadmin'), deleteProjectHandler);

router.post('/:id/tasks', addTaskHandler);
router.patch('/:id/tasks/:taskId', toggleTaskHandler);
router.delete('/:id/tasks/:taskId', deleteTaskHandler);

router.post('/:id/notes', addNoteHandler);
router.delete('/:id/notes/:noteId', deleteNoteHandler);

router.get('/:id/schedules', listSchedulesHandler);
router.post('/:id/schedules', createScheduleHandler);
router.patch('/:id/schedules/:scheduleId/pay', markSchedulePaidHandler);
router.delete('/:id/schedules/:scheduleId', deleteScheduleHandler);

export default router;

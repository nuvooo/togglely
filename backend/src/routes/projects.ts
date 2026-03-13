import { Router } from 'express';
import { body } from 'express-validator';
import {
  getProjects,
  getMyProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject
} from '../controllers/projects';
import { authenticate, requireOrgMember, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { validateOrgId, validateProjectId } from '../middleware/validateId';

const router = Router();

router.use(authenticate);

router.get('/', getMyProjects);
router.get('/organization/:orgId', validateOrgId, requireOrgMember, getProjects);
router.post(
  '/organization/:orgId',
  validateOrgId,
  requireOrgRole(['OWNER', 'ADMIN']),
  [
    body('name').trim().notEmpty(),
    body('key').trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  createProject
);

router.get('/:projectId', validateProjectId, authenticate, getProject);
router.patch(
  '/:projectId',
  validateProjectId,
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  updateProject
);
router.delete('/:projectId', validateProjectId, authenticate, deleteProject);

export { router as projectsRouter };

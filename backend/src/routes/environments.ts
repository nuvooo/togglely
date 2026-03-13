import { Router } from 'express';
import { body } from 'express-validator';
import {
  getEnvironments,
  getEnvironment,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment
} from '../controllers/environments';
import { authenticate, requireOrgMember, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.get('/project/:projectId', authenticate, getEnvironments);
router.post(
  '/project/:projectId',
  authenticate,
  [
    body('name').trim().notEmpty(),
    body('key').trim().notEmpty(),
    validate
  ],
  createEnvironment
);

router.get('/:environmentId', authenticate, getEnvironment);
router.patch('/:environmentId', authenticate, updateEnvironment);
router.delete('/:environmentId', authenticate, deleteEnvironment);

export { router as environmentsRouter };

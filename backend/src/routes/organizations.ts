import { Router } from 'express';
import { body } from 'express-validator';
import {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getMembers,
  inviteMember,
  removeMember,
  updateMemberRole
} from '../controllers/organizations';
import { authenticate, requireOrgMember, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { validateOrgId } from '../middleware/validateId';

const router = Router();

router.use(authenticate);

router.get('/', getOrganizations);
router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  createOrganization
);

router.get('/:orgId', validateOrgId, requireOrgMember, getOrganization);
router.patch(
  '/:orgId',
  validateOrgId,
  requireOrgRole(['OWNER', 'ADMIN']),
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  updateOrganization
);
router.delete('/:orgId', validateOrgId, requireOrgRole(['OWNER']), deleteOrganization);

// Members
router.get('/:orgId/members', validateOrgId, requireOrgMember, getMembers);
router.post(
  '/:orgId/members',
  validateOrgId,
  requireOrgRole(['OWNER', 'ADMIN']),
  [
    body('email').isEmail(),
    body('role').optional().isIn(['ADMIN', 'MEMBER', 'VIEWER']),
    validate
  ],
  inviteMember
);
router.patch(
  '/:orgId/members/:userId',
  validateOrgId,
  requireOrgRole(['OWNER', 'ADMIN']),
  [
    body('role').isIn(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
    validate
  ],
  updateMemberRole
);
router.delete('/:orgId/members/:userId', validateOrgId, requireOrgRole(['OWNER', 'ADMIN']), removeMember);

export { router as organizationsRouter };

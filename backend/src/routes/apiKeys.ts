import { Router } from 'express';
import { body } from 'express-validator';
import {
  getApiKeys,
  createApiKey,
  revokeApiKey,
  getMyApiKeys
} from '../controllers/apiKeys';
import { authenticate, requireOrgMember, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.get('/my', getMyApiKeys);
router.get('/organization/:orgId', requireOrgMember, getApiKeys);
router.post(
  '/organization/:orgId',
  requireOrgRole(['OWNER', 'ADMIN']),
  [
    body('name').trim().notEmpty(),
    body('type').optional().isIn(['SERVER', 'CLIENT', 'SDK']),
    body('environmentId').optional(),
    validate
  ],
  createApiKey
);
router.delete('/:keyId', revokeApiKey);

export { router as apiKeysRouter };

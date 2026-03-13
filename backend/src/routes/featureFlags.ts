import { Router } from 'express';
import { body } from 'express-validator';
import {
  getFeatureFlags,
  getMyFeatureFlags,
  getFeatureFlag,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  toggleFlag,
  updateFlagValue,
  getFlagEnvironments,
  updateFlagEnvironment,
  createTargetingRule,
  updateTargetingRule,
  deleteTargetingRule
} from '../controllers/featureFlags';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { validateProjectId, validateFlagId, validateEnvironmentId } from '../middleware/validateId';

const router = Router();

router.use(authenticate);

router.get('/', getMyFeatureFlags);
router.get('/project/:projectId', validateProjectId, authenticate, getFeatureFlags);
router.post(
  '/project/:projectId',
  validateProjectId,
  authenticate,
  [
    body('name').trim().notEmpty(),
    body('key').trim().notEmpty(),
    body('flagType').optional().isIn(['BOOLEAN', 'STRING', 'NUMBER', 'JSON']),
    body('description').optional().trim(),
    validate
  ],
  createFeatureFlag
);

router.get('/:flagId', validateFlagId, authenticate, getFeatureFlag);
router.patch(
  '/:flagId',
  validateFlagId,
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  updateFeatureFlag
);
router.delete('/:flagId', validateFlagId, authenticate, deleteFeatureFlag);

// Toggle flag in environment
router.post('/:flagId/toggle', validateFlagId, authenticate, toggleFlag);

// Update flag value
router.patch('/:flagId/value', validateFlagId, authenticate, updateFlagValue);

// Flag environments
router.get('/:flagId/environments', validateFlagId, authenticate, getFlagEnvironments);
router.patch('/:flagId/environments/:environmentId', validateFlagId, validateEnvironmentId, authenticate, updateFlagEnvironment);

// Targeting rules
router.post('/:flagId/environments/:environmentId/rules', validateFlagId, validateEnvironmentId, authenticate, createTargetingRule);
router.patch('/:flagId/environments/:environmentId/rules/:ruleId', validateFlagId, validateEnvironmentId, authenticate, updateTargetingRule);
router.delete('/:flagId/environments/:environmentId/rules/:ruleId', validateFlagId, validateEnvironmentId, authenticate, deleteTargetingRule);

export { router as featureFlagsRouter };

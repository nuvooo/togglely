import { Router } from 'express';
import { getAllFlags, getFlag, evaluateFlag } from '../controllers/sdk';
import { authenticateApiKey } from '../middleware/auth';
import { validateSdkOrigin, handleSdkPreflight } from '../middleware/sdkCors';

const router = Router();

// Handle preflight OPTIONS requests
router.use(handleSdkPreflight);

// Apply CORS validation before API key authentication
router.use(validateSdkOrigin);

// SDK endpoints use API key authentication
router.use(authenticateApiKey);

// Get all flags for an environment within a project
router.get('/flags/:projectKey/:environmentKey', getAllFlags);

// Get specific flag
router.get('/flags/:projectKey/:environmentKey/:flagKey', getFlag);

// Evaluate flag with context
router.post('/evaluate/:projectKey/:environmentKey/:flagKey', evaluateFlag);

export { router as sdkRouter };

import { Router } from 'express';
import { getAllFlags, getFlag, evaluateFlag } from '../controllers/sdk';
import { authenticateApiKey } from '../middleware/auth';

const router = Router();

// SDK endpoints use API key authentication
router.use(authenticateApiKey);

// Get all flags for an environment
router.get('/flags/:environmentKey', getAllFlags);

// Get specific flag
router.get('/flags/:environmentKey/:flagKey', getFlag);

// Evaluate flag with context
router.post('/evaluate/:environmentKey/:flagKey', evaluateFlag);

export { router as sdkRouter };

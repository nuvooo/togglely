import { Router } from 'express';
import { getAllFlags, getFlag, evaluateFlag } from '../controllers/sdk';
import { authenticateApiKey } from '../middleware/auth';
import { validateSdkOrigin, handleSdkPreflight } from '../middleware/sdkCors';

const router = Router();

// Handle preflight OPTIONS requests globally
router.use(handleSdkPreflight);

// SDK endpoints use API key authentication + CORS validation
// CORS validation is applied per-route so req.params is available

// Get all flags for an environment within a project
router.get('/flags/:projectKey/:environmentKey', 
  validateSdkOrigin,
  authenticateApiKey, 
  getAllFlags
);

// Get specific flag
router.get('/flags/:projectKey/:environmentKey/:flagKey', 
  validateSdkOrigin,
  authenticateApiKey, 
  getFlag
);

// Evaluate flag with context
router.post('/evaluate/:projectKey/:environmentKey/:flagKey', 
  validateSdkOrigin,
  authenticateApiKey, 
  evaluateFlag
);

export { router as sdkRouter };

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  getFeatureFlagWithBrandValues,
  updateDefaultValue,
  updateBrandValue 
} from '../controllers/featureFlagValues';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get feature flag with all brand values for an environment
router.get('/:flagId/environment/:environmentId/brands', getFeatureFlagWithBrandValues);

// Update default value for an environment
router.patch('/:flagId/environment/:environmentId/default', updateDefaultValue);

// Update brand-specific value
router.patch('/:flagId/environment/:environmentId/brand/:brandId', updateBrandValue);

export { router as featureFlagValuesRouter };

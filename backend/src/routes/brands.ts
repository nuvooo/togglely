import { Router } from 'express';
import { body } from 'express-validator';
import { getBrands, createBrand, updateBrand, deleteBrand } from '../controllers/brands';
import { authenticate, requireProjectMember } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.get('/project/:projectId', requireProjectMember, getBrands);
router.post(
  '/project/:projectId',
  requireProjectMember,
  [
    body('name').trim().notEmpty(),
    body('key').trim().notEmpty().matches(/^[a-z0-9-]+$/),
    body('description').optional().trim(),
    validate
  ],
  createBrand
);
router.patch(
  '/:brandId',
  requireProjectMember,
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    validate
  ],
  updateBrand
);
router.delete('/:brandId', requireProjectMember, deleteBrand);

export { router as brandsRouter };

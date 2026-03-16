import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { createAuditLog } from '../services/auditLog';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const sendInvalidIdError = (res: Response, fieldName: string = 'ID') => {
  res.status(400).json({ error: `Invalid ${fieldName} format` });
};

/**
 * Get a specific feature flag with all brand values for an environment
 * Used by the frontend to display per-brand configuration
 */
export const getFeatureFlagWithBrandValues = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { flagId, environmentId } = req.params;

    if (!isValidObjectId(flagId)) {
      return sendInvalidIdError(res, 'Flag ID');
    }

    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    // Get flag with project (to check if multi-tenant)
    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      include: {
        project: {
          include: {
            brands: {
              orderBy: { name: 'asc' }
            }
          }
        }
      }
    });

    if (!flag) {
      res.status(404).json({ error: 'Feature flag not found' });
      return;
    }

    // Get environment
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId }
    });

    if (!environment) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    // Get default flag environment (no brand)
    const defaultFlagEnv = await prisma.flagEnvironment.findFirst({
      where: {
        flagId,
        environmentId,
        brandId: null
      }
    });

    // Get all brand-specific values
    const brandValues = await Promise.all(
      flag.project.brands.map(async (brand) => {
        const brandFlagEnv = await prisma.flagEnvironment.findFirst({
          where: {
            flagId,
            environmentId,
            brandId: brand.id
          }
        });

        return {
          brandId: brand.id,
          brandKey: brand.key,
          brandName: brand.name,
          enabled: brandFlagEnv?.enabled ?? defaultFlagEnv?.enabled ?? false,
          value: brandFlagEnv?.defaultValue ?? defaultFlagEnv?.defaultValue ?? null,
          isCustom: !!brandFlagEnv
        };
      })
    );

    res.json({
      flag: {
        id: flag.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        flagType: flag.flagType
      },
      environment: {
        id: environment.id,
        key: environment.key,
        name: environment.name
      },
      defaultValue: {
        enabled: defaultFlagEnv?.enabled ?? false,
        value: defaultFlagEnv?.defaultValue ?? null
      },
      brandValues
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update default value for a feature flag in an environment
 */
export const updateDefaultValue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { flagId, environmentId } = req.params;
    const { enabled, defaultValue } = req.body;
    const userId = req.user!.userId;

    if (!isValidObjectId(flagId) || !isValidObjectId(environmentId)) {
      return sendInvalidIdError(res);
    }

    // Find or create default flag environment
    let flagEnv = await prisma.flagEnvironment.findFirst({
      where: {
        flagId,
        environmentId,
        brandId: null
      }
    });

    if (flagEnv) {
      flagEnv = await prisma.flagEnvironment.update({
        where: { id: flagEnv.id },
        data: {
          enabled: enabled ?? flagEnv.enabled,
          defaultValue: defaultValue !== undefined ? String(defaultValue) : flagEnv.defaultValue
        }
      });
    } else {
      flagEnv = await prisma.flagEnvironment.create({
        data: {
          flagId,
          environmentId,
          enabled: enabled ?? false,
          defaultValue: String(defaultValue ?? '')
        }
      });
    }

    // Get flag for audit log
    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { key: true, projectId: true, organizationId: true }
    });

    if (flag) {
      await createAuditLog({
        action: 'UPDATE',
        entityType: 'FLAG_ENVIRONMENT',
        entityId: flagEnv.id,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        userId,
        newValues: { enabled, defaultValue }
      });
    }

    res.json(flagEnv);
  } catch (error) {
    next(error);
  }
};

/**
 * Update brand-specific value for a feature flag
 */
export const updateBrandValue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { flagId, environmentId, brandId } = req.params;
    const { enabled, defaultValue } = req.body;
    const userId = req.user!.userId;

    if (!isValidObjectId(flagId) || !isValidObjectId(environmentId) || !isValidObjectId(brandId)) {
      return sendInvalidIdError(res);
    }

    // Find or create brand-specific flag environment
    let flagEnv = await prisma.flagEnvironment.findFirst({
      where: {
        flagId,
        environmentId,
        brandId
      }
    });

    if (flagEnv) {
      flagEnv = await prisma.flagEnvironment.update({
        where: { id: flagEnv.id },
        data: {
          enabled: enabled ?? flagEnv.enabled,
          defaultValue: defaultValue !== undefined ? String(defaultValue) : flagEnv.defaultValue
        }
      });
    } else {
      flagEnv = await prisma.flagEnvironment.create({
        data: {
          flagId,
          environmentId,
          brandId,
          enabled: enabled ?? false,
          defaultValue: String(defaultValue ?? '')
        }
      });
    }

    // Get flag for audit log
    const flag = await prisma.featureFlag.findUnique({
      where: { id: flagId },
      select: { key: true, projectId: true, organizationId: true }
    });

    if (flag) {
      await createAuditLog({
        action: 'UPDATE',
        entityType: 'FLAG_ENVIRONMENT',
        entityId: flagEnv.id,
        organizationId: flag.organizationId,
        projectId: flag.projectId,
        userId,
        newValues: { enabled, defaultValue, brandId }
      });
    }

    res.json(flagEnv);
  } catch (error) {
    next(error);
  }
};

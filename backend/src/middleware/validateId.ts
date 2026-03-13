import { Request, Response, NextFunction } from 'express';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const validateOrgId = (req: Request, res: Response, next: NextFunction): void => {
  const { orgId } = req.params;
  if (!orgId || !isValidObjectId(orgId)) {
    res.status(400).json({ error: 'Invalid organization ID format' });
    return;
  }
  next();
};

export const validateProjectId = (req: Request, res: Response, next: NextFunction): void => {
  const { projectId } = req.params;
  if (!projectId || !isValidObjectId(projectId)) {
    res.status(400).json({ error: 'Invalid project ID format' });
    return;
  }
  next();
};

export const validateFlagId = (req: Request, res: Response, next: NextFunction): void => {
  const { flagId } = req.params;
  if (!flagId || !isValidObjectId(flagId)) {
    res.status(400).json({ error: 'Invalid feature flag ID format' });
    return;
  }
  next();
};

export const validateEnvironmentId = (req: Request, res: Response, next: NextFunction): void => {
  const { environmentId } = req.params;
  if (!environmentId || !isValidObjectId(environmentId)) {
    res.status(400).json({ error: 'Invalid environment ID format' });
    return;
  }
  next();
};

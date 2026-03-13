import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const sendInvalidIdError = (res: Response, fieldName: string = 'ID') => {
  res.status(400).json({ error: `Invalid ${fieldName} format` });
};

export const getEnvironments = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;

    const environments = await prisma.environment.findMany({
      where: { projectId },
      include: {
        _count: {
          select: {
            flagEnvironments: true
          }
        }
      }
    });

    res.json(environments.map(e => ({
      id: e.id,
      name: e.name,
      key: e.key,
      projectId: e.projectId,
      flagCount: e._count.flagEnvironments,
      createdAt: e.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getEnvironment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentId } = req.params;

    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    const env = await prisma.environment.findUnique({
      where: { id: environmentId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            key: true
          }
        },
        flagEnvironments: {
          include: {
            flag: {
              select: {
                id: true,
                name: true,
                key: true,
                flagType: true
              }
            }
          }
        }
      }
    });

    if (!env) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    res.json({
      id: env.id,
      name: env.name,
      key: env.key,
      projectId: env.projectId,
      project: env.project,
      flags: env.flagEnvironments.map(fe => ({
        id: fe.id,
        flagId: fe.flagId,
        name: fe.flag.name,
        key: fe.flag.key,
        type: fe.flag.flagType,
        enabled: fe.enabled,
        defaultValue: fe.defaultValue
      })),
      createdAt: env.createdAt,
      updatedAt: env.updatedAt
    });
  } catch (error) {
    next(error);
  }
};

export const createEnvironment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { name, key } = req.body;

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const environment = await prisma.environment.create({
      data: {
        name,
        key,
        projectId,
        organizationId: project.organizationId
      }
    });

    res.status(201).json(environment);
  } catch (error) {
    next(error);
  }
};

export const updateEnvironment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentId } = req.params;
    const { name } = req.body;

    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    const environment = await prisma.environment.update({
      where: { id: environmentId },
      data: { name }
    });

    res.json(environment);
  } catch (error) {
    next(error);
  }
};

export const deleteEnvironment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { environmentId } = req.params;

    if (!isValidObjectId(environmentId)) {
      return sendInvalidIdError(res, 'Environment ID');
    }

    await prisma.environment.delete({
      where: { id: environmentId }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

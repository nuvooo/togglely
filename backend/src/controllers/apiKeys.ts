import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { generateApiKey } from '../utils/jwt';

export const getApiKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;

    const keys = await prisma.apiKey.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      type: k.type,
      key: k.key.substring(0, 16) + '...', // Mask the key
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdBy: k.user,
      createdAt: k.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const getMyApiKeys = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const keys = await prisma.apiKey.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      type: k.type,
      key: k.key.substring(0, 16) + '...',
      organization: k.organization,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt
    })));
  } catch (error) {
    next(error);
  }
};

export const createApiKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId } = req.params;
    const { name, type = 'SERVER', environmentId, expiresInDays } = req.body;
    const userId = req.user!.userId;

    const key = generateApiKey();
    
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        type,
        organizationId: orgId,
        userId,
        environmentId,
        expiresAt
      }
    });

    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      type: apiKey.type,
      key: apiKey.key, // Only show full key on creation
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt
    });
  } catch (error) {
    next(error);
  }
};

export const revokeApiKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { keyId } = req.params;
    const userId = req.user!.userId;

    const key = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        OR: [
          { userId },
          { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } }
        ]
      }
    });

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

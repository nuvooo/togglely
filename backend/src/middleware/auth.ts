import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { prisma } from '../utils/prisma';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload & { id: string };
  organizationId?: string;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    req.user = { ...decoded, id: decoded.userId };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '') ||
                   req.query.apiKey as string ||
                   req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key required' });
      return;
    }

    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { organization: true }
    });

    if (!keyRecord || !keyRecord.isActive) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    req.organizationId = keyRecord.organizationId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid API key' });
  }
};

export const requireOrgMember = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { orgId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId
        }
      }
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this organization' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requireOrgRole = (roles: string[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { orgId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const membership = await prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: orgId
          }
        }
      });

      if (!membership || !roles.includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

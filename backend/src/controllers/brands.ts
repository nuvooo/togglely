import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthenticatedRequest } from '../middleware/auth';

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const getBrands = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    
    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const brands = await prisma.brand.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });

    res.json(brands);
  } catch (error) {
    next(error);
  }
};

export const createBrand = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const { name, key, description } = req.body;

    if (!isValidObjectId(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        key,
        description,
        projectId
      }
    });

    res.status(201).json(brand);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Brand key already exists' });
    }
    next(error);
  }
};

export const updateBrand = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { brandId } = req.params;
    const { name, description } = req.body;

    if (!isValidObjectId(brandId)) {
      return res.status(400).json({ error: 'Invalid brand ID' });
    }

    const brand = await prisma.brand.update({
      where: { id: brandId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description })
      }
    });

    res.json(brand);
  } catch (error) {
    next(error);
  }
};

export const deleteBrand = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { brandId } = req.params;

    if (!isValidObjectId(brandId)) {
      return res.status(400).json({ error: 'Invalid brand ID' });
    }

    await prisma.brand.delete({
      where: { id: brandId }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

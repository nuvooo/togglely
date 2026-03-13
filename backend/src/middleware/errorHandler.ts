import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err);

  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    res.status(409).json({
      error: 'A record with this value already exists',
      code: 'DUPLICATE_ENTRY'
    });
    return;
  }

  // Prisma foreign key constraint
  if (err.code === 'P2003') {
    res.status(400).json({
      error: 'Referenced record does not exist',
      code: 'FOREIGN_KEY_VIOLATION'
    });
    return;
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    res.status(404).json({
      error: 'Record not found',
      code: 'NOT_FOUND'
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

import { errorHandler } from '../../middleware/errorHandler';

describe('Error Handler Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('should handle generic errors', () => {
    const error = new Error('Test error');

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal server error',
    }));
  });

  it('should handle errors with status code', () => {
    const error: any = new Error('Not found');
    error.statusCode = 404;

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Not found',
    }));
  });

  it('should handle Prisma errors', () => {
    const error: any = new Error('Unique constraint failed');
    error.code = 'P2002';

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('already exists'),
    }));
  });

  it('should handle Prisma record not found error', () => {
    const error: any = new Error('Record not found');
    error.code = 'P2025';

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Resource not found',
    }));
  });
});

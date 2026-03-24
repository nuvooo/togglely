import { BadRequestException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  it('rejects unsupported api key types', async () => {
    const prisma = {
      apiKey: {
        create: jest.fn(),
      },
    } as any;

    const service = new ApiKeysService(prisma);

    await expect(
      service.create('org-1', 'user-1', {
        name: 'Invalid key',
        type: 'ROOT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

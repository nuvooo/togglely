import { BadRequestException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  it('rejects unsupported organization roles', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }) },
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    } as any;

    const service = new OrganizationsService(prisma);

    await expect(service.addMember('org-1', 'test@example.com', 'SUPERADMIN')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

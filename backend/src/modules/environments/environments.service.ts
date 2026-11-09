import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'

@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.environment.findMany({
      where: { projectId },
    })
  }

  /**
   * Creates an environment. `organizationId` must be the owning organization
   * of the project as resolved server-side (never taken from the request).
   */
  async create(
    projectId: string,
    organizationId: string,
    data: { name: string; key: string }
  ) {
    return this.prisma.environment.create({
      data: {
        name: data.name,
        key: data.key,
        projectId,
        organizationId,
      },
    })
  }

  async update(envId: string, data: { name?: string }) {
    const updateData: { name?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    return this.prisma.environment.update({
      where: { id: envId },
      data: updateData,
    })
  }

  async delete(envId: string) {
    // Delete all flag environments for this environment first (cascading delete for MongoDB)
    await this.prisma.flagEnvironment.deleteMany({
      where: { environmentId: envId },
    })
    await this.prisma.environment.delete({ where: { id: envId } })
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../shared/prisma.service'

@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string) {
    return this.prisma.brand.findMany({
      where: { projectId },
    })
  }

  async findFlagsForBrand(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    })

    if (!brand) throw new NotFoundException('Brand not found')

    const flags = await this.prisma.featureFlag.findMany({
      where: { projectId: brand.projectId },
    })

    const environments = await this.prisma.environment.findMany({
      where: { projectId: brand.projectId },
    })

    const flagEnvs = await this.prisma.flagEnvironment.findMany({
      where: {
        flagId: { in: flags.map((f) => f.id) },
        OR: [{ brandId: null }, { brandId }],
      },
    })

    return {
      brand: { id: brand.id, name: brand.name, key: brand.key },
      flags: flags.map((f) => ({
        id: f.id,
        name: f.name,
        key: f.key,
        flagType: f.flagType,
        environments: environments.map((env) => {
          const defaultEnv = flagEnvs.find(
            (fe) =>
              fe.flagId === f.id &&
              fe.environmentId === env.id &&
              fe.brandId === null
          )
          const brandEnv = flagEnvs.find(
            (fe) =>
              fe.flagId === f.id &&
              fe.environmentId === env.id &&
              fe.brandId === brandId
          )

          return {
            id: defaultEnv?.id || brandEnv?.id || '',
            environmentId: env.id,
            environmentName: env.name,
            enabled: brandEnv?.enabled ?? defaultEnv?.enabled ?? false,
            defaultValue:
              brandEnv?.defaultValue ?? defaultEnv?.defaultValue ?? 'false',
            isBrandSpecific: !!brandEnv,
          }
        }),
      })),
    }
  }

  async create(
    projectId: string,
    data: { name: string; key: string; description?: string }
  ) {
    return this.prisma.brand.create({
      data: {
        name: data.name,
        key: data.key,
        description: data.description,
        projectId,
      },
    })
  }

  async update(brandId: string, data: { name?: string; description?: string }) {
    // Copy only whitelisted fields (never projectId/key from the request).
    const updateData: { name?: string; description?: string } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    return this.prisma.brand.update({
      where: { id: brandId },
      data: updateData,
    })
  }

  async delete(brandId: string) {
    // Delete all flag environments for this brand first (cascading delete for MongoDB)
    await this.prisma.flagEnvironment.deleteMany({ where: { brandId } })
    await this.prisma.brand.delete({ where: { id: brandId } })
  }

  async toggleFlag(
    brandId: string,
    flagId: string,
    environmentId: string,
    enabled?: boolean
  ) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { id: flagId },
    })

    if (!flag) throw new NotFoundException('Flag not found')

    const existing = await this.prisma.flagEnvironment.findFirst({
      where: { flagId, environmentId, brandId },
    })

    if (existing) {
      const newEnabled = enabled !== undefined ? enabled : !existing.enabled
      const updateData: Record<string, unknown> = { enabled: newEnabled }
      if (flag.flagType === 'BOOLEAN') {
        updateData.defaultValue = String(newEnabled)
      }

      return this.prisma.flagEnvironment.update({
        where: { id: existing.id },
        data: updateData,
      })
    }

    try {
      const newEnabled = enabled ?? true
      return await this.prisma.flagEnvironment.create({
        data: {
          flagId,
          environmentId,
          brandId,
          enabled: newEnabled,
          defaultValue:
            flag.flagType === 'BOOLEAN' ? String(newEnabled) : 'false',
        },
      })
    } catch (e: unknown) {
      const prismaError = e as { code?: string }
      if (prismaError.code === 'P2002') {
        const found = await this.prisma.flagEnvironment.findFirst({
          where: { flagId, environmentId, brandId },
        })
        if (found) {
          return this.prisma.flagEnvironment.update({
            where: { id: found.id },
            data: { enabled: enabled ?? true },
          })
        }
      }
      throw e
    }
  }
}

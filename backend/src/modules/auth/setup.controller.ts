import { Controller, NotFoundException, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../shared/prisma.service'
import { deleteProjectChangeData } from '../change-events/project-cleanup'

/**
 * Demo reset endpoint. Creates a user with publicly known credentials, so it
 * is disabled unless ENABLE_DEMO_RESET=true is set explicitly (demo
 * instances only — never on a production deployment).
 */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Post('reset-demo')
  @Throttle({ default: { ttl: 60000, limit: 2 } })
  async resetDemo() {
    if (this.config.get<string>('ENABLE_DEMO_RESET') !== 'true') {
      throw new NotFoundException()
    }

    // Delete existing demo user and related data
    const existingUser = await this.prisma.user.findUnique({
      where: { email: 'demo@togglely.io' },
    })

    if (existingUser) {
      // Find the user's organizations before removing the memberships
      const memberships = await this.prisma.organizationMember.findMany({
        where: { userId: existingUser.id },
      })

      await this.prisma.organizationMember.deleteMany({
        where: { userId: existingUser.id },
      })

      for (const membership of memberships) {
        // Delete projects and related data
        const projects = await this.prisma.project.findMany({
          where: { organizationId: membership.organizationId },
        })

        for (const project of projects) {
          await this.prisma.flagEnvironment.deleteMany({
            where: { flag: { projectId: project.id } },
          })
          await this.prisma.featureFlag.deleteMany({
            where: { projectId: project.id },
          })
          await this.prisma.environment.deleteMany({
            where: { projectId: project.id },
          })
          await this.prisma.brand.deleteMany({
            where: { projectId: project.id },
          })
          // Config versions, webhooks and deliveries (no cascades in MongoDB)
          await deleteProjectChangeData(this.prisma, project.id)
        }

        await this.prisma.project.deleteMany({
          where: { organizationId: membership.organizationId },
        })
      }

      // Delete organizations
      const orgIds = memberships.map((m) => m.organizationId)
      await this.prisma.organization.deleteMany({
        where: { id: { in: orgIds } },
      })

      // Delete user
      await this.prisma.user.delete({
        where: { id: existingUser.id },
      })
    }

    // Create fresh demo user
    const hashedPassword = await bcrypt.hash('demo123!', 12)

    const user = await this.prisma.user.create({
      data: {
        email: 'demo@togglely.io',
        password: hashedPassword,
        firstName: 'Demo',
        lastName: 'User',
      },
    })

    const org = await this.prisma.organization.create({
      data: {
        name: 'Demo Organization',
        slug: 'demo-organization',
        description: 'A demo organization for testing',
      },
    })

    await this.prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: 'OWNER',
      },
    })

    // Create sample project
    const project = await this.prisma.project.create({
      data: {
        name: 'Sample Project',
        key: 'sample-project',
        description: 'A sample project',
        type: 'SINGLE',
        organizationId: org.id,
        environments: {
          create: [
            {
              name: 'Development',
              key: 'development',
              organizationId: org.id,
              sortOrder: 0,
            },
            {
              name: 'Production',
              key: 'production',
              organizationId: org.id,
              sortOrder: 1,
            },
          ],
        },
      },
    })

    return {
      success: true,
      message: 'Demo data reset successfully',
      credentials: {
        email: 'demo@togglely.io',
        password: 'demo123!',
      },
    }
  }
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { OrganizationRole } from '@prisma/client'
import { PrismaService } from '../../shared/prisma.service'
import { hashApiKey } from '../api-keys/api-keys.service'

export interface McpContext {
  apiKeyId: string
  apiKeyName: string
  userId: string
  organizationId: string
  projectId: string
  allowedEnvironmentIds: string[]
  role: OrganizationRole
}

const MCP_KEY_PREFIX = 'tkm_'
const LAST_USED_THROTTLE_MS = 60_000

@Injectable()
export class McpKeyResolver {
  private readonly logger = new Logger(McpKeyResolver.name)

  constructor(private readonly prisma: PrismaService) {}

  async resolve(authorizationHeader: string | undefined): Promise<McpContext> {
    const fail = () => new UnauthorizedException('Invalid API key')

    const match = authorizationHeader?.match(/^Bearer\s+(\S+)$/i)
    const token = match?.[1]
    if (!token || !token.startsWith(MCP_KEY_PREFIX)) throw fail()

    const key = await this.prisma.apiKey.findFirst({
      where: { keyHash: hashApiKey(token) },
    })
    if (!key || key.type !== 'MCP' || !key.isActive) throw fail()
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw fail()
    if (!key.userId || !key.projectId) throw fail()

    const user = await this.prisma.user.findUnique({
      where: { id: key.userId },
    })
    if (!user || !user.isActive) throw fail()

    const member = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: key.userId,
          organizationId: key.organizationId,
        },
      },
    })
    if (!member) throw fail()

    if (
      !key.lastUsedAt ||
      Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
    ) {
      this.prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch((err: unknown) =>
          this.logger.warn(
            `Failed to update lastUsedAt: ${err instanceof Error ? err.message : err}`
          )
        )
    }

    return {
      apiKeyId: key.id,
      apiKeyName: key.name,
      userId: key.userId,
      organizationId: key.organizationId,
      projectId: key.projectId,
      allowedEnvironmentIds: key.allowedEnvironmentIds,
      role: member.role,
    }
  }
}

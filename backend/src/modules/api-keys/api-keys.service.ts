import { BadRequestException, Injectable } from '@nestjs/common'
import { ApiKeyType, OrganizationRole } from '@prisma/client'
import * as crypto from 'crypto'
import { hasRole } from '../../shared/access/access.service'
import { PrismaService } from '../../shared/prisma.service'

const API_KEY_LIST_SELECT = {
  id: true,
  name: true,
  key: true,
  type: true,
  isActive: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
  environmentId: true,
  organizationId: true,
  organization: { select: { id: true, name: true } },
} as const

/** Masks an API key so that it can be shown to non-admin members. */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 11) return '…'
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}

@Injectable()
export class ApiKeysService {
  private static readonly allowedKeyTypes = new Set<ApiKeyType>([
    'SERVER',
    'CLIENT',
    'SDK',
  ])

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the API keys of every organization the user belongs to. The full
   * key is only revealed to ADMIN/OWNER members of the key's organization.
   */
  async findByUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true, role: true },
    })

    if (!memberships.length) return []

    const roleByOrg = new Map<string, OrganizationRole>(
      memberships.map((m) => [m.organizationId, m.role])
    )

    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: { in: [...roleByOrg.keys()] } },
      select: API_KEY_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    })

    return keys.map((k) => this.maskForRole(k, roleByOrg.get(k.organizationId)))
  }

  /** Returns the API keys of one organization, masked according to `role`. */
  async findByOrganization(orgId: string, role: OrganizationRole) {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: orgId },
      select: API_KEY_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    return keys.map((k) => this.maskForRole(k, role))
  }

  async create(
    orgId: string,
    userId: string,
    data: { name: string; type?: string; expiresInDays?: number }
  ) {
    const key = `tk_${crypto.randomBytes(32).toString('hex')}`
    const type = this.parseApiKeyType(data.type)

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    return this.prisma.apiKey.create({
      data: {
        name: data.name,
        key,
        type,
        organizationId: orgId,
        userId,
        expiresAt,
        isActive: true,
      },
    })
  }

  private maskForRole<T extends { key: string }>(
    apiKey: T,
    role: OrganizationRole | undefined
  ): T {
    if (role && hasRole(role, 'ADMIN')) return apiKey
    return { ...apiKey, key: maskApiKey(apiKey.key) }
  }

  private parseApiKeyType(type?: string): ApiKeyType {
    if (!type) {
      return 'SDK'
    }

    if (!ApiKeysService.allowedKeyTypes.has(type as ApiKeyType)) {
      throw new BadRequestException(`Invalid API key type: ${type}`)
    }

    return type as ApiKeyType
  }

  /** Deletes a key, scoped to its organization to prevent cross-tenant deletes. */
  async delete(keyId: string, organizationId: string) {
    await this.prisma.apiKey.deleteMany({
      where: { id: keyId, organizationId },
    })
  }
}

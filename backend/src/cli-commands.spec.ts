import { runCli } from './cli-commands'
import { AuditLogsService } from './modules/audit-logs/audit-logs.service'
import { PasswordResetService } from './modules/password-reset/password-reset.service'
import { PrismaService } from './shared/prisma.service'

const USER = { id: 'user-1', email: 'user@example.com', isActive: true }
const EXPIRES = new Date('2026-11-09T13:00:00.000Z')
const URL = 'http://localhost:3000/reset-password?token=abc'

function setup(opts: { user?: any; membership?: any } = {}) {
  const user = 'user' in opts ? opts.user : USER
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organizationMember: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          'membership' in opts ? opts.membership : { organizationId: 'org-1' }
        ),
    },
  }
  const passwordReset = {
    createResetLink: jest
      .fn()
      .mockResolvedValue({ resetUrl: URL, expiresAt: EXPIRES }),
  }
  const audit = { create: jest.fn().mockResolvedValue({}) }
  const app = {
    get: jest.fn((token: unknown) => {
      if (token === PrismaService) return prisma
      if (token === PasswordResetService) return passwordReset
      if (token === AuditLogsService) return audit
      throw new Error('unexpected provider')
    }),
  }
  const out: string[] = []
  const err: string[] = []
  const io = { out: (m: string) => out.push(m), err: (m: string) => err.push(m) }
  return { app, io, out, err, prisma, passwordReset, audit }
}

describe('runCli', () => {
  it('prints usage and fails without a command', async () => {
    const { app, io, err } = setup()
    await expect(runCli([], app as any, io)).resolves.toBe(1)
    expect(err.join('\n')).toContain('reset-password <email>')
  })

  it('prints usage and succeeds for --help', async () => {
    const { app, io, out } = setup()
    await expect(runCli(['--help'], app as any, io)).resolves.toBe(0)
    expect(out.join('\n')).toContain('reset-password <email>')
  })

  it('rejects unknown commands and missing/extra arguments', async () => {
    for (const argv of [
      ['frobnicate'],
      ['reset-password'],
      ['reset-password', 'a@example.com', 'extra'],
    ]) {
      const { app, io, err, passwordReset } = setup()
      await expect(runCli(argv, app as any, io)).resolves.toBe(1)
      expect(err.join('\n')).toContain('Usage')
      expect(passwordReset.createResetLink).not.toHaveBeenCalled()
    }
  })

  it('fails for an unknown email', async () => {
    const { app, io, err, passwordReset } = setup({ user: null })
    await expect(
      runCli(['reset-password', 'nobody@example.com'], app as any, io)
    ).resolves.toBe(1)
    expect(err.join('\n')).toContain('nobody@example.com')
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('fails for a deactivated user', async () => {
    const { app, io, passwordReset } = setup({
      user: { ...USER, isActive: false },
    })
    await expect(
      runCli(['reset-password', 'user@example.com'], app as any, io)
    ).resolves.toBe(1)
    expect(passwordReset.createResetLink).not.toHaveBeenCalled()
  })

  it('creates a link, prints it with the expiry and audits it', async () => {
    const { app, io, out, prisma, passwordReset, audit } = setup()
    await expect(
      runCli(['reset-password', ' User@Example.com '], app as any, io)
    ).resolves.toBe(0)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    })
    expect(passwordReset.createResetLink).toHaveBeenCalledWith('user-1')
    const printed = out.join('\n')
    expect(printed).toContain(URL)
    expect(printed).toContain(EXPIRES.toISOString())
    expect(audit.create).toHaveBeenCalledWith({
      action: 'user.password_reset_link_created',
      entityType: 'User',
      entityId: 'user-1',
      userId: 'user-1',
      organizationId: 'org-1',
      newValues: { via: 'cli', expiresAt: EXPIRES.toISOString() },
    })
    expect(JSON.stringify(audit.create.mock.calls)).not.toContain('token=')
  })

  it('skips the audit entry when the user has no organization', async () => {
    const { app, io, audit } = setup({ membership: null })
    await expect(
      runCli(['reset-password', 'user@example.com'], app as any, io)
    ).resolves.toBe(0)
    expect(audit.create).not.toHaveBeenCalled()
  })
})

import { INestApplicationContext } from '@nestjs/common'
import { AuditLogsService } from './modules/audit-logs/audit-logs.service'
import { PasswordResetService } from './modules/password-reset/password-reset.service'
import { PrismaService } from './shared/prisma.service'
import { findUserByEmail } from './shared/users'

export interface CliIo {
  out(message: string): void
  err(message: string): void
}

const consoleIo: CliIo = {
  out: (message) => process.stdout.write(`${message}\n`),
  err: (message) => process.stderr.write(`${message}\n`),
}

export const USAGE = `Usage: node dist/cli <command>

Commands:
  reset-password <email>   Create a one-time password reset link (valid 1h)
                           for the user and print it. No mail is sent.
  help                     Show this help`

/**
 * Server operator commands. Returns the process exit code; the caller owns
 * the application context (see cli.ts).
 */
export async function runCli(
  argv: string[],
  app: Pick<INestApplicationContext, 'get'>,
  io: CliIo = consoleIo
): Promise<number> {
  const [command, ...args] = argv

  if (command === 'help' || command === '--help' || command === '-h') {
    io.out(USAGE)
    return 0
  }

  if (command === 'reset-password' && args.length === 1 && args[0].trim()) {
    return resetPassword(args[0], app, io)
  }

  io.err(USAGE)
  return 1
}

async function resetPassword(
  email: string,
  app: Pick<INestApplicationContext, 'get'>,
  io: CliIo
): Promise<number> {
  const prisma = app.get(PrismaService)
  const user = await findUserByEmail(prisma, email)
  if (!user) {
    io.err(`No user found with email ${email.trim()}`)
    return 1
  }
  if (!user.isActive) {
    io.err(`User ${user.email} is deactivated; reactivate the account first`)
    return 1
  }

  const { resetUrl, expiresAt } = await app
    .get(PasswordResetService)
    .createResetLink(user.id)

  // Audit logs are organization-scoped; users without an org are skipped.
  // The schema requires a user, so the entry hangs off the target; the actor
  // is the server operator, which the action and newValues make explicit.
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  })
  if (membership) {
    await app.get(AuditLogsService).create({
      action: 'user.password_reset_link_created_by_operator',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      organizationId: membership.organizationId,
      newValues: {
        via: 'cli',
        actor: 'server-operator',
        expiresAt: expiresAt.toISOString(),
      },
    })
  }

  io.out(`Password reset link for ${user.email}:`)
  io.out(resetUrl)
  io.out(`Expires at: ${expiresAt.toISOString()}`)
  io.out('Any previously issued reset link for this user is now invalid.')
  return 0
}

import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { runCli, USAGE } from './cli-commands'

/**
 * Operator CLI, e.g. inside the container:
 *   node dist/cli reset-password 'user@example.com'
 * Boots only the application context (no HTTP server).
 */
async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    process.stderr.write(`${USAGE}\n`)
    process.exit(1)
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  let code = 1
  try {
    code = await runCli(argv, app)
  } catch (error) {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`
    )
  } finally {
    await app.close()
  }
  process.exit(code)
}

main()

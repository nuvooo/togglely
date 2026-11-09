import { MailService } from './mail.service'

function createService(env: Record<string, string | undefined>) {
  const mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) }
  const config = {
    get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
  } as any
  const service = new MailService(mailerService as any, config)
  return { service, mailerService }
}

describe('MailService (password reset module)', () => {
  it('is disabled without SMTP_HOST and does not send', async () => {
    const { service, mailerService } = createService({})
    expect(service.isEnabled()).toBe(false)
    await expect(
      service.sendPasswordResetEmail('a@example.com', 'token')
    ).resolves.toBe(false)
    expect(mailerService.sendMail).not.toHaveBeenCalled()
  })

  it('sends when SMTP_HOST is set', async () => {
    const { service, mailerService } = createService({
      SMTP_HOST: 'smtp.example.com',
    })
    expect(service.isEnabled()).toBe(true)
    await expect(
      service.sendPasswordResetEmail('a@example.com', 'token')
    ).resolves.toBe(true)
    expect(mailerService.sendMail).toHaveBeenCalledTimes(1)
  })
})

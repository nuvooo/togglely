import { MailService } from './mail.service'

function createService(env: Record<string, string | undefined>) {
  const mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) }
  const config = { get: jest.fn((key: string) => env[key]) } as any
  const service = new MailService(mailerService as any, config)
  return { service, mailerService }
}

describe('MailService (shared)', () => {
  describe('isEnabled', () => {
    it('is disabled without SMTP_HOST', () => {
      expect(createService({}).service.isEnabled()).toBe(false)
      expect(createService({ SMTP_HOST: '' }).service.isEnabled()).toBe(false)
    })

    it('is enabled when SMTP_HOST is set', () => {
      expect(
        createService({ SMTP_HOST: 'smtp.example.com' }).service.isEnabled()
      ).toBe(true)
    })
  })

  describe('without SMTP', () => {
    it('does not send any mail and reports false', async () => {
      const { service, mailerService } = createService({})
      await expect(
        service.sendVerificationEmail('a@example.com', 't', 'http://x')
      ).resolves.toBe(false)
      await expect(
        service.sendInviteEmail('a@example.com', 't', 'Org', 'http://x')
      ).resolves.toBe(false)
      await expect(
        service.sendPasswordResetEmail('a@example.com', 't', 'http://x')
      ).resolves.toBe(false)
      expect(mailerService.sendMail).not.toHaveBeenCalled()
    })
  })

  describe('with SMTP', () => {
    it('sends mail and reports true', async () => {
      const { service, mailerService } = createService({
        SMTP_HOST: 'smtp.example.com',
      })
      await expect(
        service.sendInviteEmail('a@example.com', 't', 'Org', 'http://x')
      ).resolves.toBe(true)
      expect(mailerService.sendMail).toHaveBeenCalledTimes(1)
    })

    it('reports false when sending fails', async () => {
      const { service, mailerService } = createService({
        SMTP_HOST: 'smtp.example.com',
      })
      mailerService.sendMail.mockRejectedValueOnce(new Error('down'))
      await expect(
        service.sendVerificationEmail('a@example.com', 't', 'http://x')
      ).resolves.toBe(false)
    })
  })
})

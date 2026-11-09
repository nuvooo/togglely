import { OverviewController } from './overview.controller'

describe('OverviewController', () => {
  it('returns the overview of the authenticated user', async () => {
    const overview = { counts: {}, recentFlags: [], projects: [] }
    const service = {
      getOverview: jest.fn().mockResolvedValue(overview),
    } as any
    const controller = new OverviewController(service)
    await expect(
      controller.getOverview({ user: { userId: 'u1' } })
    ).resolves.toBe(overview)
    expect(service.getOverview).toHaveBeenCalledWith('u1')
  })
})

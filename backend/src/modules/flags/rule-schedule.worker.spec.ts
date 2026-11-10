import { RuleScheduleWorker } from './rule-schedule.worker'

const NOW = new Date('2026-11-27T00:00:30.000Z')
const FROM = new Date('2026-11-27T00:00:00.000Z')
const UNTIL = new Date('2026-11-30T00:00:00.000Z')

const dueRule = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  activeFrom: FROM,
  activeUntil: UNTIL,
  nextBoundaryAt: FROM,
  flagEnvironment: {
    environmentId: 'env1',
    flag: { key: 'black-friday', projectId: 'p1', organizationId: 'o1' },
  },
  ...overrides,
})

function setup(rules = [dueRule()], claimed = 1) {
  const prisma: any = {
    targetingRule: {
      findMany: jest.fn().mockResolvedValue(rules),
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
    },
  }
  const changes: any = { recordChange: jest.fn().mockResolvedValue(undefined) }
  return { worker: new RuleScheduleWorker(prisma, changes), prisma, changes }
}

describe('RuleScheduleWorker', () => {
  const originalEnv = process.env.RULE_SCHEDULER_DISABLED
  afterEach(() => {
    jest.useRealTimers()
    if (originalEnv === undefined) delete process.env.RULE_SCHEDULER_DISABLED
    else process.env.RULE_SCHEDULER_DISABLED = originalEnv
  })

  it('loads only rules whose next bound has passed', async () => {
    const { worker, prisma } = setup([])
    await worker.tick(NOW)
    expect(prisma.targetingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nextBoundaryAt: { lte: NOW } } })
    )
  })

  it('claims the bound, moves to the next one and announces the change', async () => {
    const { worker, prisma, changes } = setup()
    await expect(worker.tick(NOW)).resolves.toBe(1)
    expect(prisma.targetingRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', nextBoundaryAt: FROM },
      data: { nextBoundaryAt: UNTIL },
    })
    expect(changes.recordChange).toHaveBeenCalledWith({
      organizationId: 'o1',
      projectId: 'p1',
      environmentIds: ['env1'],
      changes: [{ flagKey: 'black-friday', action: 'rules_changed' }],
    })
  })

  it('sets no further bound after the window ended', async () => {
    const { worker, prisma } = setup([dueRule({ nextBoundaryAt: UNTIL })])
    await worker.tick(new Date('2026-11-30T00:00:10.000Z'))
    expect(prisma.targetingRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nextBoundaryAt: null } })
    )
  })

  it('announces nothing when another instance claimed the bound', async () => {
    const { worker, changes } = setup([dueRule()], 0)
    await expect(worker.tick(NOW)).resolves.toBe(0)
    expect(changes.recordChange).not.toHaveBeenCalled()
  })

  it('keeps going when one rule fails', async () => {
    const { worker, prisma, changes } = setup([
      dueRule({ id: 'broken' }),
      dueRule({ id: 'r2' }),
    ])
    prisma.targetingRule.updateMany
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ count: 1 })
    await expect(worker.tick(NOW)).resolves.toBe(1)
    expect(changes.recordChange).toHaveBeenCalledTimes(1)
  })

  it('polls every 30 s and stops on destroy', async () => {
    jest.useFakeTimers()
    delete process.env.RULE_SCHEDULER_DISABLED
    const { worker, prisma } = setup([])
    worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(30_000)
    expect(prisma.targetingRule.findMany).toHaveBeenCalledTimes(1)
    worker.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(prisma.targetingRule.findMany).toHaveBeenCalledTimes(1)
  })

  it('does not start when RULE_SCHEDULER_DISABLED=true', async () => {
    jest.useFakeTimers()
    process.env.RULE_SCHEDULER_DISABLED = 'true'
    const { worker, prisma } = setup([])
    worker.onModuleInit()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(prisma.targetingRule.findMany).not.toHaveBeenCalled()
  })
})

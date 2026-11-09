import { currentActor, runWithActor } from './actor-context'

describe('actor-context', () => {
  it('exposes the actor inside runWithActor and nothing outside', async () => {
    expect(currentActor()).toBeUndefined()
    const seen = await runWithActor(
      { apiKeyId: 'k1', apiKeyName: 'Claude' },
      async () => {
        await Promise.resolve()
        return currentActor()
      }
    )
    expect(seen).toEqual({ apiKeyId: 'k1', apiKeyName: 'Claude' })
    expect(currentActor()).toBeUndefined()
  })
})

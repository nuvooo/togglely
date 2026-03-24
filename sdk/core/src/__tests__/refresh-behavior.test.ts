import { TogglelyClient } from '../index';

describe('TogglelyClient refresh behavior', () => {
  const baseConfig = {
    apiKey: 'test-key',
    project: 'test-project',
    environment: 'production',
    baseUrl: 'https://example.com',
    autoFetch: false,
    offlineFallback: false,
  } as const;

  beforeEach(() => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deduplicates concurrent refresh calls', async () => {
    let resolveFetch: any;
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const client = new TogglelyClient(baseConfig);
    const a = client.refresh();
    const b = client.refresh();

    resolveFetch({
      ok: true,
      json: async () => ({ featureA: { value: true, enabled: true, flagType: 'BOOLEAN' } }),
    });

    await a;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  it('emits update only when data changes', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ featureA: { value: true, enabled: true, flagType: 'BOOLEAN' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ featureA: { value: true, enabled: true, flagType: 'BOOLEAN' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ featureA: { value: false, enabled: true, flagType: 'BOOLEAN' } }),
      });

    const client = new TogglelyClient(baseConfig);
    const onUpdate = jest.fn();
    client.on('update', onUpdate);

    await client.refresh();
    await client.refresh();
    await client.refresh();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    client.destroy();
  });
});

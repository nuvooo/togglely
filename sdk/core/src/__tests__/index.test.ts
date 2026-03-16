import { TogglelyClient, togglesToEnvVars, createOfflineTogglesScript } from '../index';

describe('TogglelyClient', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    project: 'test-project',
    environment: 'development',
    baseUrl: 'https://api.togglely.io',
    autoFetch: false // Disable auto-fetch for tests
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('initialization', () => {
    it('should create client with default config', () => {
      const client = new TogglelyClient(mockConfig);
      expect(client).toBeDefined();
      expect(client.isReady()).toBe(false);
      client.destroy();
    });

    it('should load offline toggles from environment variables', () => {
      const client = new TogglelyClient({ ...mockConfig, offlineFallback: true });
      const allToggles = client.getAllToggles();
      expect(allToggles['test-feature']).toBeDefined();
      expect(allToggles['test-feature'].value).toBe(true);
      client.destroy();
    });

    it('should not auto-fetch when autoFetch is false', () => {
      new TogglelyClient(mockConfig);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('context handling', () => {
    it('should set and get context', () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ userId: '123', tenantId: 'acme' });
      
      expect(client.getContext()).toEqual({ userId: '123', tenantId: 'acme' });
      client.destroy();
    });

    it('should merge context', () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ userId: '123' });
      client.setContext({ tenantId: 'acme' });
      
      expect(client.getContext()).toEqual({ userId: '123', tenantId: 'acme' });
      client.destroy();
    });

    it('should clear context', () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ userId: '123' });
      client.clearContext();
      
      expect(client.getContext()).toEqual({});
      client.destroy();
    });
  });

  describe('API calls with brandKey and context', () => {
    it('should send both brandKey and context when tenantId is set', async () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ userId: '123', tenantId: 'acme-corp' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: true, enabled: true })
      });

      await client.getValue('test-flag');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0];
      
      // Should contain both brandKey and context
      expect(url).toContain('brandKey=acme-corp');
      expect(url).toContain('context=');
      expect(url).toContain('tenantId');
      expect(url).toContain('userId');
      
      client.destroy();
    });

    it('should send context without brandKey when no tenantId/brandKey', async () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ userId: '123', country: 'DE' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: true, enabled: true })
      });

      await client.getValue('test-flag');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0];
      
      // Should contain context but not brandKey
      expect(url).not.toContain('brandKey=');
      expect(url).toContain('context=');
      
      client.destroy();
    });
  });

  describe('refresh (manual fetch)', () => {
    it('should fetch all flags on refresh', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'feature-a': { value: true, enabled: true },
          'feature-b': { value: 'test', enabled: true }
        })
      });

      await client.refresh();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sdk/flags/test-project/development'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
      
      expect(client.isReady()).toBe(true);
      client.destroy();
    });

    it('should include brandKey and context in refresh', async () => {
      const client = new TogglelyClient(mockConfig);
      client.setContext({ tenantId: 'acme', userId: '123' });
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await client.refresh();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0];
      
      expect(url).toContain('brandKey=acme');
      expect(url).toContain('context=');
      
      client.destroy();
    });
  });

  describe('toggle accessors', () => {
    it('should return boolean value from cache', async () => {
      const client = new TogglelyClient(mockConfig);
      
      // Pre-populate cache via refresh
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'bool-flag': { value: true, enabled: true }
        })
      });
      await client.refresh();

      const value = await client.isEnabled('bool-flag', false);
      expect(value).toBe(true);
      
      // Should not make another API call
      expect(global.fetch).toHaveBeenCalledTimes(1);
      
      client.destroy();
    });

    it('should return default value when toggle not found', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: 404,
        status: 404
      });

      const value = await client.isEnabled('missing-flag', false);
      expect(value).toBe(false);
      
      client.destroy();
    });

    it('should return string value', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: 'hello', enabled: true })
      });

      const value = await client.getString('msg-flag', 'default');
      expect(value).toBe('hello');
      
      client.destroy();
    });

    it('should return number value', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: 42, enabled: true })
      });

      const value = await client.getNumber('limit-flag', 0);
      expect(value).toBe(42);
      
      client.destroy();
    });

    it('should return JSON value', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: '{"theme":"dark"}', enabled: true })
      });

      const value = await client.getJSON('config-flag', {});
      expect(value).toEqual({ theme: 'dark' });
      
      client.destroy();
    });
  });

  describe('events', () => {
    it('should emit ready event after first successful refresh', async () => {
      const client = new TogglelyClient(mockConfig);
      const readyHandler = jest.fn();
      
      client.on('ready', readyHandler);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await client.refresh();

      expect(readyHandler).toHaveBeenCalled();
      
      client.destroy();
    });

    it('should emit update event on refresh', async () => {
      const client = new TogglelyClient(mockConfig);
      const updateHandler = jest.fn();
      
      client.on('update', updateHandler);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await client.refresh();

      expect(updateHandler).toHaveBeenCalled();
      
      client.destroy();
    });

    it('should allow unsubscribing from events', async () => {
      const client = new TogglelyClient(mockConfig);
      const handler = jest.fn();
      
      const unsubscribe = client.on('ready', handler);
      unsubscribe();
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await client.refresh();

      expect(handler).not.toHaveBeenCalled();
      
      client.destroy();
    });
  });

  describe('no polling behavior', () => {
    it('should not poll automatically', async () => {
      jest.useFakeTimers();
      
      const client = new TogglelyClient({ ...mockConfig, autoFetch: false });
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      // Fast-forward 10 minutes
      jest.advanceTimersByTime(10 * 60 * 1000);
      
      // Should not have made any calls
      expect(global.fetch).not.toHaveBeenCalled();
      
      client.destroy();
      jest.useRealTimers();
    });

    it('should allow manual refresh', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await client.refresh();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await client.refresh();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      
      client.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      const client = new TogglelyClient(mockConfig);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'test': { value: true, enabled: true } })
      });

      await client.refresh();
      expect(client.getAllToggles()).toHaveProperty('test');

      client.destroy();
      expect(client.getAllToggles()).toEqual({});
    });
  });
});

describe('Utility functions', () => {
  describe('togglesToEnvVars', () => {
    it('should convert toggles to env vars', () => {
      const toggles = {
        'dark-mode': true,
        'api-url': 'https://api.com'
      };

      const envVars = togglesToEnvVars(toggles);

      expect(envVars).toEqual({
        'TOGGLELY_DARK_MODE': 'true',
        'TOGGLELY_API_URL': 'https://api.com'
      });
    });

    it('should use custom prefix', () => {
      const toggles = { feature: true };
      const envVars = togglesToEnvVars(toggles, 'MYAPP_');

      expect(envVars).toEqual({
        'MYAPP_FEATURE': 'true'
      });
    });
  });

  describe('createOfflineTogglesScript', () => {
    it('should create script tag with toggles', () => {
      const toggles = { 'new-feature': true };
      const script = createOfflineTogglesScript(toggles);

      expect(script).toContain('<script>');
      expect(script).toContain('window.__TOGGLELY_TOGGLES');
      expect(script).toContain('"new-feature":true');
      expect(script).toContain('</script>');
    });
  });
});

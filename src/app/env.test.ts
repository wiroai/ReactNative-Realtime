describe('env', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('throws when WIRO_API_KEY is missing', () => {
    jest.doMock('react-native-config', () => ({
      __esModule: true,
      default: {},
    }));

    expect(() => require('./env')).toThrow(/WIRO_API_KEY is missing/);
  });

  it('exposes the credentials when WIRO_API_KEY is set', () => {
    jest.doMock('react-native-config', () => ({
      __esModule: true,
      default: { WIRO_API_KEY: 'key', WIRO_API_SECRET: 'secret' },
    }));

    const { env } = require('./env');
    expect(env).toEqual({ wiroApiKey: 'key', wiroApiSecret: 'secret' });
  });
});

import { wrapGraphqlResolversWithMetrics } from '../metrics';

describe('wrapGraphqlResolversWithMetrics', () => {
  it('returns resolvers unchanged when Prometheus metrics are disabled', async () => {
    const resolverMap = {
      Query: {
        currentUser: jest.fn(async () => ({ id: 'u1' })),
      },
    } as const;

    const wrapped = wrapGraphqlResolversWithMetrics(resolverMap);

    expect(wrapped).toBe(resolverMap);
    await expect(wrapped.Query.currentUser()).resolves.toEqual({ id: 'u1' });
    expect(resolverMap.Query.currentUser).toHaveBeenCalledTimes(1);
  });
});

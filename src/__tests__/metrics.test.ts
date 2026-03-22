import {
  graphqlResolverCallsTotal,
  graphqlResolverDurationSeconds,
  wrapGraphqlResolversWithMetrics,
} from '../metrics';

describe('wrapGraphqlResolversWithMetrics', () => {
  beforeEach(() => {
    graphqlResolverCallsTotal.reset();
    graphqlResolverDurationSeconds.reset();
  });

  it('records resolver calls and duration for successful executions', async () => {
    const resolverMap = {
      Query: {
        currentUser: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { id: 'u1' };
        },
      },
    };

    const wrapped = wrapGraphqlResolversWithMetrics(resolverMap);
    await wrapped.Query.currentUser();

    const callMetrics = await graphqlResolverCallsTotal.get();
    const durationMetrics = await graphqlResolverDurationSeconds.get();

    expect(callMetrics.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: {
            operation_type: 'Query',
            resolver_name: 'currentUser',
            status: 'success',
          },
          value: 1,
        }),
      ]),
    );

    expect(durationMetrics.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: {
            operation_type: 'Query',
            resolver_name: 'currentUser',
            status: 'success',
          },
        }),
      ]),
    );
  });

  it('records resolver calls and duration for failed executions', async () => {
    const resolverMap = {
      Mutation: {
        updateUser: () => {
          throw new Error('boom');
        },
      },
    };

    const wrapped = wrapGraphqlResolversWithMetrics(resolverMap);

    expect(() => wrapped.Mutation.updateUser()).toThrow('boom');

    const callMetrics = await graphqlResolverCallsTotal.get();
    const durationMetrics = await graphqlResolverDurationSeconds.get();

    expect(callMetrics.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: {
            operation_type: 'Mutation',
            resolver_name: 'updateUser',
            status: 'error',
          },
          value: 1,
        }),
      ]),
    );

    expect(durationMetrics.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: {
            operation_type: 'Mutation',
            resolver_name: 'updateUser',
            status: 'error',
          },
        }),
      ]),
    );
  });
});

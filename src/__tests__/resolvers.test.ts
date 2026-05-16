jest.mock('../models/user', () => ({
  userModel: {
    expireToFreeIfNeeded: jest.fn(),
    getById: jest.fn(),
  },
}));

jest.mock('../models/billingHistory', () => ({
  billingHistoryModel: {
    addSubscriptionExpired: jest.fn(),
  },
}));

jest.mock('../metrics', () => ({
  wrapGraphqlResolversWithMetrics: (resolvers: unknown) => resolvers,
}));

import { resolvers } from '../resolvers';
import errorCode from '../error_code';
import { userModel } from '../models/user';
import { billingHistoryModel } from '../models/billingHistory';

describe('resolvers.Query.user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns USER_NOT_FOUND when the authenticated account no longer exists', async () => {
    (userModel.expireToFreeIfNeeded as jest.Mock).mockResolvedValue(null);
    (userModel.getById as jest.Mock).mockResolvedValue(null);

    const result = await resolvers.Query.user(null, null, { uid: 42 });

    expect(result).toEqual({
      __typename: 'Error',
      code: errorCode.USER_NOT_FOUND,
    });
    expect(billingHistoryModel.addSubscriptionExpired).not.toHaveBeenCalled();
  });

  it('returns a typed User when the account exists', async () => {
    (userModel.expireToFreeIfNeeded as jest.Mock).mockResolvedValue(null);
    (userModel.getById as jest.Mock).mockResolvedValue({
      id: 42,
      email: 'beekeeper@example.com',
      stripe_subscription: 'sub_123',
    });

    const result = await resolvers.Query.user(null, null, { uid: 42 });

    expect(result).toEqual({
      __typename: 'User',
      id: 42,
      email: 'beekeeper@example.com',
      hasSubscription: true,
    });
  });
});


describe('resolvers.Query.aiAdvisorUsage', () => {
  it('returns null until AI Advisor usage accounting is implemented', async () => {
    await expect(resolvers.Query.aiAdvisorUsage()).resolves.toBeNull();
  });
});

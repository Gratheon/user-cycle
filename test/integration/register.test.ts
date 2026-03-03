import crypto from 'crypto';

const URL = 'http://localhost:4000/graphql';

const REGISTER_MUTATION = `
mutation register($input: RegisterInput!) {
  register(input: $input) {
    __typename
    ... on Error {
      code
    }
    ... on UserSession {
      key
      user {
        id
        email
      }
    }
  }
}
`;

const NONCE_QUERY = `
query registrationNonce {
  registrationNonce {
    nonce
    challenge
    difficulty
  }
}
`;

async function gqlRequest(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'internal-router-signature': 'test-signature',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

function solvePow(challenge: string, difficulty: number): string {
  const prefix = '0'.repeat(difficulty);

  for (let i = 0; i < 1_500_000; i++) {
    const solution = i.toString(16);
    const hash = crypto
      .createHash('sha256')
      .update(challenge + solution)
      .digest('hex');

    if (hash.startsWith(prefix)) {
      return solution;
    }
  }

  throw new Error('Could not solve registration proof-of-work challenge');
}

async function getNonceAndSolution() {
  const nonceResult = await gqlRequest(NONCE_QUERY);
  const noncePayload = nonceResult?.data?.registrationNonce;

  if (!noncePayload) {
    throw new Error('registrationNonce query returned no payload');
  }

  return {
    nonce: noncePayload.nonce as string,
    solution: solvePow(noncePayload.challenge as string, noncePayload.difficulty as number),
  };
}

async function register(input: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  lang?: string;
  nonce?: string;
  solution?: string;
}) {
  const nonceData = input.nonce && input.solution
    ? { nonce: input.nonce, solution: input.solution }
    : await getNonceAndSolution();

  return gqlRequest(REGISTER_MUTATION, {
    input: {
      first_name: input.first_name ?? 'james',
      last_name: input.last_name ?? 'bond',
      lang: input.lang ?? 'en',
      email: input.email,
      password: input.password,
      nonce: nonceData.nonce,
      solution: nonceData.solution,
    },
  });
}

describe('register integration', () => {
  it('registers a user', async () => {
    const email = `artkurapov+${Date.now()}@gmail.com`;
    const result = await register({ email, password: 'Test1234' });

    expect(result?.data?.register?.__typename).toBe('UserSession');
    expect(result?.data?.register?.key).toBeDefined();
    expect(result?.data?.register?.user?.email).toBe(email);
  });

  it('logs in on duplicate registration with same password', async () => {
    const email = `artkurapov+${Date.now()}@gmail.com`;

    await register({ email, password: 'Test1234' });
    const result = await register({ email, password: 'Test1234' });

    expect(result?.data?.register?.__typename).toBe('UserSession');
    expect(result?.data?.register?.key).toBeDefined();
  });

  it('fails with INVALID_EMAIL on invalid email', async () => {
    const result = await register({ email: 'artk@aa', password: 'Test1234' });

    expect(result?.data).toEqual({
      register: {
        __typename: 'Error',
        code: 'INVALID_EMAIL',
      },
    });
  });

  it('fails with SIMPLE_PASSWORD on empty password', async () => {
    const email = `artkurapov+${Date.now()}@gmail.com`;
    const result = await register({ email, password: '' });

    expect(result?.data).toEqual({
      register: {
        __typename: 'Error',
        code: 'SIMPLE_PASSWORD',
      },
    });
  });

  it('fails with EMAIL_TAKEN when email is reused with different password', async () => {
    const email = `artkurapov+${Date.now()}@gmail.com`;

    await register({ email, password: 'Test1234' });
    const result = await register({ email, password: 'Test5678' });

    expect(result?.data).toEqual({
      register: {
        __typename: 'Error',
        code: 'EMAIL_TAKEN',
      },
    });
  });

  it('fails with MISSING_NONCE when nonce is omitted', async () => {
    const result = await gqlRequest(REGISTER_MUTATION, {
      input: {
        first_name: 'james',
        last_name: 'bond',
        lang: 'en',
        email: `artkurapov+${Date.now()}@gmail.com`,
        password: 'Test1234',
        nonce: '',
        solution: '',
      },
    });

    expect(result?.data).toEqual({
      register: {
        __typename: 'Error',
        code: 'MISSING_NONCE',
      },
    });
  });

  it('fails with INVALID_PROOF_OF_WORK on bad solution', async () => {
    const { nonce } = await getNonceAndSolution();

    const result = await register({
      email: `artkurapov+${Date.now()}@gmail.com`,
      password: 'Test1234',
      nonce,
      solution: 'invalid-solution',
    });

    expect(result?.data).toEqual({
      register: {
        __typename: 'Error',
        code: 'INVALID_PROOF_OF_WORK',
      },
    });
  });
});

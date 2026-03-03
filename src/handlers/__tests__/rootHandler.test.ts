import { rootHandler } from '../rootHandler';

describe('rootHandler', () => {
  it('renders HTML API documentation page', () => {
    const send = jest.fn();
    const type = jest.fn(() => ({ send }));
    const reply = { type };

    rootHandler({}, reply as any);

    expect(type).toHaveBeenCalledWith('text/html');
    expect(send).toHaveBeenCalledTimes(1);

    const html = send.mock.calls[0][0] as string;
    expect(html).toContain('User-Cycle microservice API');
    expect(html).toContain('Available Endpoints');
    expect(html).toContain('/health');
    expect(html).toContain('/stripe/webhook');
    expect(html).toContain('/google/callback');
  });
});

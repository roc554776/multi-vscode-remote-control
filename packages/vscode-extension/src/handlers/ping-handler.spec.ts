import { describe, expect, it } from 'vitest';

import { handlePing } from './ping-handler.js';

describe('handlePing', () => {
  it('returns pong response', () => {
    const response = handlePing(1);

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      result: {
        message: 'pong',
      },
      id: 1,
    });
    expect(typeof (response.result as { timestamp: number }).timestamp).toBe('number');
  });

  it('preserves string id', () => {
    const response = handlePing('req-1');

    expect(response.id).toBe('req-1');
  });
});

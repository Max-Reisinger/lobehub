// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { fetchSSE } from '../fetchSSE';

describe('fetchSSE with real event parsing', () => {
  it.each(['', ': keep-alive\n\n', '\n', 'id: 42\n\n'])(
    'completes without errors for a valid SSE prefix %j',
    async (prefix) => {
      const onErrorHandle = vi.fn();
      const onFinish = vi.fn();
      const onMessageHandle = vi.fn();

      await fetchSSE('https://example.invalid', {
        fetcher: async () =>
          new Response(`${prefix}event: text\ndata: "hello"\n\n${prefix}`, {
            headers: { 'content-type': 'text/event-stream' },
          }),
        onErrorHandle,
        onFinish,
        onMessageHandle,
        responseAnimation: 'none',
      });

      expect(onErrorHandle).not.toHaveBeenCalled();
      expect(onMessageHandle).toHaveBeenCalledExactlyOnceWith({ text: 'hello', type: 'text' });
      expect(onFinish).toHaveBeenCalledExactlyOnceWith(
        'hello',
        expect.objectContaining({ type: 'done' }),
      );
    },
  );

  it.each(['not-json', ''])('still reports invalid JSON data %j', async (data) => {
    const onErrorHandle = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await fetchSSE('https://example.invalid', {
        fetcher: async () => new Response(`event: text\ndata: ${data}\n\n`),
        onErrorHandle,
        responseAnimation: 'none',
      });
      expect(onErrorHandle).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: 'StreamChunkError' }),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

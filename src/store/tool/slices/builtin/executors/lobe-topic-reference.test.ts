import { beforeEach, describe, expect, it, vi } from 'vitest';

import { topicReferenceExecutor } from './lobe-topic-reference';

const { searchQuery } = vi.hoisted(() => ({ searchQuery: vi.fn() }));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    search: { query: { query: searchQuery } },
    topic: { getTopicContext: { query: vi.fn() } },
  },
}));

describe('topicReferenceExecutor history search', () => {
  const context = { messageId: 'tool-message-1' };
  beforeEach(() => {
    searchQuery.mockReset();
  });

  const topic = {
    agent: { title: 'Pricing assistant' },
    agentId: 'agent-other',
    description: 'Discussed Pulse pricing',
    groupId: null,
    id: 'topic-1',
    title: 'Pulse pricing',
    type: 'topic',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('dispatches a topic search without a user-supplied topic ID', async () => {
    searchQuery.mockResolvedValue([topic]);

    const result = await topicReferenceExecutor.invoke('searchTopics', { query: 'Pulse' }, context);

    expect(result.success).toBe(true);
    expect(JSON.parse(result.content!)).toEqual({
      results: [
        expect.objectContaining({
          agentId: 'agent-other',
          topicId: 'topic-1',
          url: '/agent/agent-other/topic-1',
        }),
      ],
    });
  });

  it('returns a group message link and a bounded excerpt around the query', async () => {
    searchQuery.mockResolvedValue([
      {
        agentId: null,
        content: `${'x'.repeat(700)} Railway runbook ${'y'.repeat(700)}`,
        description: 'Runbook discussion',
        groupId: 'group-1',
        id: 'message-1',
        title: 'Runbook message',
        topicId: 'topic-2',
        type: 'message',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    const result = await topicReferenceExecutor.invoke(
      'searchMessages',
      { query: 'Railway' },
      context,
    );
    const [item] = JSON.parse(result.content!).results;

    expect(result.success).toBe(true);
    expect(item.url).toBe('/group/group-1/topic-2#message-1');
    expect(item.snippet).toContain('Railway');
    expect(item.snippet.length).toBeLessThanOrEqual(500);
  });

  it('does not invent a link for an orphaned topic', async () => {
    searchQuery.mockResolvedValue([{ ...topic, agentId: null }]);
    const result = await topicReferenceExecutor.invoke('searchTopics', { query: 'Pulse' }, context);
    expect(JSON.parse(result.content!).results[0].url).toBeNull();
  });

  it('limits results and does not return another entity type', async () => {
    searchQuery.mockResolvedValue([
      { ...topic, type: 'agent' },
      topic,
      { ...topic, id: 'topic-2' },
    ]);
    const result = await topicReferenceExecutor.invoke(
      'searchTopics',
      { limit: 1, query: 'Pulse' },
      context,
    );
    expect(JSON.parse(result.content!).results).toHaveLength(1);
    expect(JSON.parse(result.content!).results[0].id).toBe('topic-1');
  });

  it('treats no matches as a successful empty result', async () => {
    searchQuery.mockResolvedValue([]);
    const result = await topicReferenceExecutor.invoke(
      'searchMessages',
      { query: 'missing' },
      context,
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(result.content!)).toEqual({ results: [] });
  });

  it.each([
    { query: '   ' },
    { query: '' },
    { limit: 0, query: 'Pulse' },
    { limit: 21, query: 'Pulse' },
    { limit: 1.5, query: 'Pulse' },
    { agentId: '', query: 'Pulse' },
  ])('rejects invalid arguments without searching: %j', async (params) => {
    const result = await topicReferenceExecutor.invoke('searchTopics', params, context);
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('InvalidSearchArguments');
    expect(searchQuery).not.toHaveBeenCalled();
  });

  it('preserves search failures instead of returning empty history', async () => {
    searchQuery.mockRejectedValue(new Error('Search backend unavailable'));
    const result = await topicReferenceExecutor.invoke(
      'searchMessages',
      { query: 'Pulse' },
      context,
    );
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('ConversationSearchError');
    expect(result.content).toContain('Search backend unavailable');
  });
});

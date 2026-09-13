import { TopicReferenceIdentifier } from '@lobechat/builtin-tool-topic-reference';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ToolExecutionContext } from '../../types';

const { mockCreateFtsSearchRepo, mockSearchHistory } = vi.hoisted(() => ({
  mockCreateFtsSearchRepo: vi.fn(),
  mockSearchHistory: vi.fn(),
}));

vi.mock('@/server/services/ftsSearch', () => ({
  createFtsSearchRepo: mockCreateFtsSearchRepo,
}));

// Mock database models
const mockTopicModelFindOwnTopicById = vi.fn();
const mockMessageModelQuery = vi.fn();

vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn().mockImplementation(function () {
    return {
      findOwnTopicById: (...args: any[]) => mockTopicModelFindOwnTopicById(...args),
    };
  }),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {
      query: (...args: any[]) => mockMessageModelQuery(...args),
    };
  }),
}));

// Import after mock setup
const { MessageModel } = await import('@/database/models/message');
const { TopicModel } = await import('@/database/models/topic');
const { topicReferenceRuntime } = await import('../topicReference');

describe('topicReferenceRuntime history search', () => {
  beforeEach(() => {
    mockSearchHistory.mockReset();
    mockCreateFtsSearchRepo.mockReset();
    mockCreateFtsSearchRepo.mockResolvedValue({ search: mockSearchHistory });
  });

  const createRuntime = (workspaceId?: string) =>
    topicReferenceRuntime.factory({
      agentVisibility: 'private',
      serverDB: {} as NonNullable<ToolExecutionContext['serverDB']>,
      toolManifestMap: {},
      userId: 'owner-1',
      workspaceId,
    });

  it('uses trusted scope while allowing an optional cross-agent filter', async () => {
    mockSearchHistory.mockResolvedValue([]);
    const result = await createRuntime('workspace-1').searchTopics({
      agentId: 'agent-other',
      query: '  Pulse  ',
    });

    expect(result.success).toBe(true);
    expect(mockCreateFtsSearchRepo).toHaveBeenCalledWith(
      expect.objectContaining({
        callerAgentVisibility: 'private',
        userId: 'owner-1',
        workspaceId: 'workspace-1',
      }),
    );
    expect(mockSearchHistory).toHaveBeenCalledWith({
      agentId: 'agent-other',
      limitPerType: 5,
      query: 'Pulse',
      type: 'topic',
    });
  });

  it('keeps personal mode and does not add a current-agent filter', async () => {
    mockSearchHistory.mockResolvedValue([
      {
        agentId: 'other-agent',
        content: 'Railway runbook',
        groupId: null,
        id: 'message-1',
        title: 'Railway runbook',
        topicId: 'topic-1',
        type: 'message',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    const result = await createRuntime().searchMessages({ limit: 2, query: 'Railway' });

    expect(result.success).toBe(true);
    expect(JSON.parse(result.content).results[0].url).toBe('/agent/other-agent/topic-1#message-1');
    expect(mockCreateFtsSearchRepo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', workspaceId: undefined }),
    );
    expect(mockSearchHistory).toHaveBeenCalledWith({
      agentId: undefined,
      limitPerType: 2,
      query: 'Railway',
      type: 'message',
    });
  });

  it('cannot replace trusted identity with model-supplied scope arguments', async () => {
    mockSearchHistory.mockResolvedValue([]);
    await createRuntime('workspace-1').searchTopics({
      query: 'Pulse',
      userId: 'other-owner',
      workspaceId: 'other-workspace',
    });

    expect(mockCreateFtsSearchRepo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', workspaceId: 'workspace-1' }),
    );
    expect(mockSearchHistory).toHaveBeenCalledWith({
      agentId: undefined,
      limitPerType: 5,
      query: 'Pulse',
      type: 'topic',
    });
  });

  it('returns failure when the configured provider cannot be created', async () => {
    mockCreateFtsSearchRepo.mockRejectedValue(new Error('Provider unavailable'));
    const result = await createRuntime().searchTopics({ query: 'Pulse' });
    expect(result.success).toBe(false);
    expect(result.content).toContain('Provider unavailable');
    expect(mockSearchHistory).not.toHaveBeenCalled();
  });
});

describe('topicReferenceRuntime', () => {
  it('should have the correct identifier', () => {
    expect(topicReferenceRuntime.identifier).toBe(TopicReferenceIdentifier);
    expect(topicReferenceRuntime.identifier).toBe('lobe-topic-reference');
  });

  describe('factory', () => {
    it('should throw when serverDB is missing', () => {
      const context: ToolExecutionContext = {
        toolManifestMap: {},
        userId: 'user-1',
      };

      expect(() => topicReferenceRuntime.factory(context)).toThrow(
        'serverDB is required for TopicReference execution',
      );
    });

    it('should throw when userId is missing', () => {
      const context: ToolExecutionContext = {
        serverDB: {} as any,
        toolManifestMap: {},
      };

      expect(() => topicReferenceRuntime.factory(context)).toThrow(
        'userId is required for TopicReference execution',
      );
    });

    it('should create a runtime with getTopicContext method', () => {
      const context: ToolExecutionContext = {
        serverDB: {} as any,
        toolManifestMap: {},
        userId: 'user-1',
      };

      const runtime = topicReferenceRuntime.factory(context);
      expect(runtime).toBeDefined();
      expect(typeof runtime.getTopicContext).toBe('function');
    });

    it('should scope models to workspace context', async () => {
      const serverDB = {} as any;
      const runtime = topicReferenceRuntime.factory({
        serverDB,
        toolManifestMap: {},
        userId: 'user-1',
        workspaceId: 'workspace-1',
      });

      mockTopicModelFindOwnTopicById.mockResolvedValue({ id: 'topic-1', title: 'Topic' });
      mockMessageModelQuery.mockResolvedValue([]);

      await runtime.getTopicContext({ topicId: 'topic-1' });

      expect(TopicModel).toHaveBeenCalledWith(serverDB, 'user-1', 'workspace-1');
      expect(MessageModel).toHaveBeenCalledWith(serverDB, 'user-1', 'workspace-1');
    });
  });

  describe('getTopicContext', () => {
    let runtime: any;

    beforeEach(() => {
      vi.clearAllMocks();

      const context: ToolExecutionContext = {
        serverDB: {} as any,
        toolManifestMap: {},
        userId: 'user-1',
      };

      runtime = topicReferenceRuntime.factory(context);
    });

    it('should return error when topicId is missing', async () => {
      const result = await runtime.getTopicContext({ topicId: '' });

      expect(result).toEqual({ content: 'topicId is required', success: false });
    });

    it('should return error when topicId is undefined', async () => {
      const result = await runtime.getTopicContext({ topicId: undefined });

      expect(result).toEqual({ content: 'topicId is required', success: false });
    });

    it('should return error when topic is not found', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue(null);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result).toEqual({
        content: 'Topic not found: topic-123',
        success: false,
      });
      expect(mockTopicModelFindOwnTopicById).toHaveBeenCalledWith('topic-123');
    });

    it('should return historySummary when topic has one', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        historySummary: 'This is a summary of the conversation.',
        id: 'topic-123',
        title: 'My Topic',
      });

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result).toEqual({
        content: '# Topic: My Topic\n\n## Summary\nThis is a summary of the conversation.',
        success: true,
      });
      // Should NOT fetch messages when summary exists
      expect(mockMessageModelQuery).not.toHaveBeenCalled();
    });

    it('should use "Untitled" when topic has no title and has historySummary', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        historySummary: 'Summary content',
        id: 'topic-123',
        title: null,
      });

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.content).toContain('# Topic: Untitled');
      expect(result.success).toBe(true);
    });

    it('should fallback to messages when topic has no historySummary', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        agentId: 'agent-1',
        groupId: 'group-1',
        id: 'topic-123',
        title: 'Chat Topic',
      });

      mockMessageModelQuery.mockResolvedValue([
        { content: 'Hello', role: 'user' },
        { content: 'Hi there!', role: 'assistant' },
      ]);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(true);
      expect(result.content).toContain('# Topic: Chat Topic');
      expect(result.content).toContain('## Recent Messages');
      expect(result.content).toContain('**User**: Hello');
      expect(result.content).toContain('**Assistant**: Hi there!');

      expect(mockMessageModelQuery).toHaveBeenCalledWith({
        agentId: 'agent-1',
        groupId: 'group-1',
        topicId: 'topic-123',
      });
    });

    it('should pass undefined agentId/groupId when topic has none', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Simple Topic',
      });

      mockMessageModelQuery.mockResolvedValue([]);

      await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(mockMessageModelQuery).toHaveBeenCalledWith({
        agentId: undefined,
        groupId: undefined,
        topicId: 'topic-123',
      });
    });

    it('should limit messages to last 30', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Long Chat',
      });

      // Create 35 messages with unique identifiable content
      const messages = Array.from({ length: 35 }, (_, i) => ({
        content: `UniqueMsg-${String(i + 1).padStart(3, '0')}`,
        role: 'user',
      }));
      mockMessageModelQuery.mockResolvedValue(messages);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(true);
      // Should only contain last 30 messages (indices 5-34, i.e. UniqueMsg-006 to UniqueMsg-035)
      expect(result.content).not.toContain('UniqueMsg-001');
      expect(result.content).not.toContain('UniqueMsg-005');
      expect(result.content).toContain('UniqueMsg-006');
      expect(result.content).toContain('UniqueMsg-035');
    });

    it('should skip messages with empty content', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Topic',
      });

      mockMessageModelQuery.mockResolvedValue([
        { content: 'Valid message', role: 'user' },
        { content: '', role: 'assistant' },
        { content: '   ', role: 'user' },
        { content: 'Another message', role: 'assistant' },
      ]);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.content).toContain('**User**: Valid message');
      expect(result.content).toContain('**Assistant**: Another message');
      // Empty/whitespace messages should not appear
      const lines = result.content.split('\n').filter((l: string) => l.trim());
      const messageLines = lines.filter((l: string) => l.startsWith('**'));
      expect(messageLines).toHaveLength(2);
    });

    it('should handle non-user and non-assistant roles', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Topic',
      });

      mockMessageModelQuery.mockResolvedValue([
        { content: 'System message', role: 'system' },
        { content: 'Tool result', role: 'tool' },
      ]);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(true);
      expect(result.content).toContain('**system**: System message');
      expect(result.content).toContain('**tool**: Tool result');
    });

    it('should return error when topic model throws', async () => {
      const error = new Error('Database connection failed');
      mockTopicModelFindOwnTopicById.mockRejectedValue(error);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(false);
      expect(result.content).toContain('Failed to fetch topic context: Database connection failed');
      expect(result.error).toBe(error);
    });

    it('should return error when message model throws', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Topic',
      });

      const error = new Error('Query failed');
      mockMessageModelQuery.mockRejectedValue(error);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(false);
      expect(result.content).toContain('Failed to fetch topic context: Query failed');
      expect(result.error).toBe(error);
    });

    it('should handle non-Error exceptions', async () => {
      mockTopicModelFindOwnTopicById.mockRejectedValue('string error');

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(false);
      expect(result.content).toContain('Failed to fetch topic context: string error');
    });

    it('should handle null message content', async () => {
      mockTopicModelFindOwnTopicById.mockResolvedValue({
        id: 'topic-123',
        title: 'Topic',
      });

      mockMessageModelQuery.mockResolvedValue([
        { content: null, role: 'user' },
        { content: 'Real message', role: 'assistant' },
      ]);

      const result = await runtime.getTopicContext({ topicId: 'topic-123' });

      expect(result.success).toBe(true);
      // null content should be treated as empty and skipped
      const messageLines = result.content.split('\n').filter((l: string) => l.startsWith('**'));
      expect(messageLines).toHaveLength(1);
      expect(result.content).toContain('**Assistant**: Real message');
    });
  });
});

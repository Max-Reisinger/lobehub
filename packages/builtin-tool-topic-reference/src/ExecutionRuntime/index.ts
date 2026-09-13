import {
  AGENT_CHAT_TOPIC_URL,
  AGENT_CHAT_URL,
  GROUP_CHAT_TOPIC_URL,
  GROUP_CHAT_URL,
} from '@lobechat/const/url';
import type { BuiltinToolResult } from '@lobechat/types';

import type { SearchHistoryItem, SearchHistoryParams, SearchHistoryQuery } from '../types';

interface ConversationSearchResult extends BuiltinToolResult {
  content: string;
}

/** Shared search behavior; adapters supply authenticated, scope-aware search services. */
export class ConversationSearchRuntime {
  constructor(
    private readonly searchService: (params: SearchHistoryQuery) => Promise<SearchHistoryItem[]>,
  ) {}

  searchTopics = async (params: SearchHistoryParams): Promise<ConversationSearchResult> =>
    this.search(params, 'topic');

  searchMessages = async (params: SearchHistoryParams): Promise<ConversationSearchResult> =>
    this.search(params, 'message');

  private search = async (
    params: SearchHistoryParams,
    type: SearchHistoryQuery['type'],
  ): Promise<ConversationSearchResult> => {
    const query = typeof params.query === 'string' ? params.query.trim() : '';
    const limit = params.limit ?? 5;
    let validationError: string | undefined;

    if (!query) {
      validationError = 'query must be a non-empty string';
    } else if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      validationError = 'limit must be an integer between 1 and 20';
    } else if (
      params.agentId !== undefined &&
      (typeof params.agentId !== 'string' || !params.agentId.trim())
    ) {
      validationError = 'agentId must be a non-empty string';
    }

    if (validationError) {
      return {
        content: validationError,
        error: { message: validationError, type: 'InvalidSearchArguments' },
        success: false,
      };
    }

    try {
      const items = await this.searchService({
        agentId: params.agentId,
        limitPerType: limit,
        query,
        type,
      });

      const results = items
        .filter((item) => item.type === type)
        .slice(0, limit)
        .map((item) => {
          const topicId = item.type === 'topic' ? item.id : (item.topicId ?? null);
          let url: string | null = null;

          if (item.agentId) {
            url = topicId
              ? AGENT_CHAT_TOPIC_URL(item.agentId, topicId)
              : AGENT_CHAT_URL(item.agentId);
          } else if (item.groupId) {
            url = topicId
              ? GROUP_CHAT_TOPIC_URL(item.groupId, topicId)
              : GROUP_CHAT_URL(item.groupId);
          }

          if (url && item.type === 'message') url += `#${item.id}`;

          const text =
            item.type === 'message' ? (item.content ?? item.title) : (item.description ?? '');
          const matchIndex = text.toLowerCase().indexOf(query.toLowerCase());
          const snippetStart = Math.max(0, matchIndex - 120);

          return {
            agentId: item.agentId,
            agentName: item.type === 'topic' ? item.agent?.title : item.description,
            groupId: item.groupId,
            id: item.id,
            messageId: item.type === 'message' ? item.id : undefined,
            snippet: text.slice(snippetStart, snippetStart + 500),
            title: item.title,
            topicId,
            type: item.type,
            updatedAt: item.updatedAt,
            url,
          };
        });

      return {
        content: JSON.stringify({ results }),
        state: { results },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Failed to search conversation history: ${message}`,
        error: { message, type: 'ConversationSearchError' },
        success: false,
      };
    }
  };
}

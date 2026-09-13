import { ConversationSearchRuntime } from '@lobechat/builtin-tool-topic-reference/executionRuntime';
import { TopicReferenceExecutor } from '@lobechat/builtin-tool-topic-reference/executor';
import type { BuiltinToolResult } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

interface GetTopicContextParams {
  topicId: string;
}

class TopicReferenceExecutionRuntime {
  private searchRuntime = new ConversationSearchRuntime(async (params) => {
    const results = await lambdaClient.search.query.query({
      ...params,
      includeMarketplace: false,
    });

    return results.filter((item) => item.type === 'topic' || item.type === 'message');
  });

  searchMessages = this.searchRuntime.searchMessages;

  searchTopics = this.searchRuntime.searchTopics;

  getTopicContext = async (params: GetTopicContextParams): Promise<BuiltinToolResult> => {
    const { topicId } = params;

    if (!topicId) {
      return { content: 'topicId is required', success: false };
    }

    try {
      const result = await lambdaClient.topic.getTopicContext.query({ topicId });
      return { content: result.content, success: result.success };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { content: `Failed to fetch topic context: ${errorMessage}`, success: false };
    }
  };
}

const runtime = new TopicReferenceExecutionRuntime();

export const topicReferenceExecutor = new TopicReferenceExecutor(runtime);

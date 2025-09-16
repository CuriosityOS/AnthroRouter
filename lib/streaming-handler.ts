import { Response } from 'express';

export async function handleStreamingResponse(openRouterResponse: globalThis.Response, expressRes: Response) {
  // Set SSE headers
  expressRes.setHeader('Content-Type', 'text/event-stream');
  expressRes.setHeader('Cache-Control', 'no-cache');
  expressRes.setHeader('Connection', 'keep-alive');
  expressRes.setHeader('X-Accel-Buffering', 'no');

  const reader = openRouterResponse.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    expressRes.end();
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          // Handle [DONE] message
          if (data === '[DONE]') {
            // Send Anthropic completion event
            const anthropicDone = { type: 'message_stop' };
            expressRes.write(`data: ${JSON.stringify(anthropicDone)}\n\n`);
            // Don't send the event: message_stop line - Claude Code doesn't expect it
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const anthropicEvent = transformStreamChunk(parsed);

            if (anthropicEvent) {
              expressRes.write(`data: ${JSON.stringify(anthropicEvent)}\n\n`);
            }
          } catch (e) {
            // Skip invalid JSON
            console.error('Failed to parse stream chunk:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Streaming error:', error);
  } finally {
    expressRes.end();
  }
}

function transformStreamChunk(openRouterChunk: any): any {
  // Handle different types of OpenRouter streaming events
  if (openRouterChunk.choices && openRouterChunk.choices[0]) {
    const choice = openRouterChunk.choices[0];

    // Check if this is a delta event
    if (choice.delta) {
      if (choice.delta.content) {
        return {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: choice.delta.content
          }
        };
      }
    }

    // Check if this is a message completion
    if (choice.message) {
      return {
        type: 'message_start',
        message: {
          id: openRouterChunk.id,
          type: 'message',
          role: 'assistant',
          content: [],
          model: openRouterChunk.model,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0
          }
        }
      };
    }

    // Handle finish reason
    if (choice.finish_reason) {
      return {
        type: 'message_delta',
        delta: {
          stop_reason: mapFinishReason(choice.finish_reason),
          stop_sequence: null
        },
        usage: {
          output_tokens: openRouterChunk.usage?.completion_tokens || 0
        }
      };
    }
  }

  return null;
}

function mapFinishReason(openRouterReason: string): string {
  switch (openRouterReason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'stop_sequence';
    default:
      return openRouterReason;
  }
}
export class StreamingResponseHandler {
  handleStream(openRouterResponse: Response): Response {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Create a transform stream to convert OpenRouter SSE to Anthropic SSE
    const transformStream = new TransformStream({
      transform: async (chunk, controller) => {
        const text = decoder.decode(chunk, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            // Skip [DONE] message
            if (data === '[DONE]') {
              // Send Anthropic completion event
              const anthropicDone = this.createAnthropicStreamEnd();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(anthropicDone)}\n\n`));
              controller.enqueue(encoder.encode('event: message_stop\n\n'));
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const anthropicEvent = this.transformStreamChunk(parsed);

              if (anthropicEvent) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(anthropicEvent)}\n\n`));
              }
            } catch (e) {
              // Skip invalid JSON
              console.error('Failed to parse stream chunk:', e);
            }
          } else if (line.trim() === '') {
            // Pass through empty lines
            controller.enqueue(encoder.encode('\n'));
          }
        }
      },

      flush(controller) {
        // Ensure stream is properly closed
        controller.terminate();
      }
    });

    // Pipe the OpenRouter response through our transform
    const reader = openRouterResponse.body!.pipeThrough(transformStream);

    return new Response(reader, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  private transformStreamChunk(openRouterChunk: any): any {
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
            stop_reason: this.mapFinishReason(choice.finish_reason),
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

  private createAnthropicStreamEnd(): any {
    return {
      type: 'message_stop'
    };
  }

  private mapFinishReason(openRouterReason: string): string {
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
}
// No model mapping needed - pass through model names directly

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  metadata?: any;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicRequestHandler {
  private request: AnthropicRequest;

  constructor(request: AnthropicRequest) {
    this.request = request;
  }

  transformToOpenRouter(): OpenRouterRequest {
    // Use the model name directly - no mapping needed
    const openRouterModel = this.request.model;

    // Transform messages
    const messages: OpenRouterMessage[] = [];

    // Add system message if present
    if (this.request.system) {
      messages.push({
        role: 'system',
        content: this.request.system
      });
    }

    // Transform each message
    for (const msg of this.request.messages) {
      const content = this.extractContent(msg.content);
      messages.push({
        role: msg.role,
        content
      });
    }

    // Build OpenRouter request
    const openRouterRequest: OpenRouterRequest = {
      model: openRouterModel,
      messages,
      stream: this.request.stream ?? false
    };

    // Map optional parameters
    if (this.request.max_tokens !== undefined) {
      openRouterRequest.max_tokens = this.request.max_tokens;
    }
    if (this.request.temperature !== undefined) {
      openRouterRequest.temperature = this.request.temperature;
    }
    if (this.request.top_p !== undefined) {
      openRouterRequest.top_p = this.request.top_p;
    }
    if (this.request.stop_sequences) {
      openRouterRequest.stop = this.request.stop_sequences;
    }

    return openRouterRequest;
  }

  transformToAnthropicResponse(openRouterResponse: OpenRouterResponse): AnthropicResponse {
    const choice = openRouterResponse.choices[0];

    return {
      id: openRouterResponse.id,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: choice.message.content
      }],
      model: this.request.model,
      stop_reason: this.mapFinishReason(choice.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: openRouterResponse.usage?.prompt_tokens || 0,
        output_tokens: openRouterResponse.usage?.completion_tokens || 0
      }
    };
  }


  private extractContent(content: string | Array<{ type: string; text?: string; [key: string]: any }>): string {
    if (typeof content === 'string') {
      return content;
    }

    // Extract text from content blocks
    const textParts: string[] = [];
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      }
      // Handle image blocks if needed in the future
      if (block.type === 'image') {
        textParts.push('[Image content not supported in this proxy]');
      }
    }

    return textParts.join('\n');
  }

  private mapFinishReason(openRouterReason: string): string | null {
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
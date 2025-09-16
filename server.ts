import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { validateApiKey, checkRateLimit } from './lib/auth';
import { AnthropicRequestHandler } from './lib/request-handler';
import { handleStreamingResponse } from './lib/streaming-handler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main API endpoint
app.post('/api/v1/messages', async (req, res) => {
  try {
    // Validate API key
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Missing x-api-key header'
        }
      });
    }

    const isValid = await validateApiKey(apiKey);
    if (!isValid) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid API key'
        }
      });
    }

    // Check rate limiting
    const rateLimit = await checkRateLimit(apiKey);
    if (!rateLimit.allowed) {
      res.set({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(Math.floor(rateLimit.resetAt / 1000))
      });
      return res.status(429).json({
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded. Please try again later.'
        }
      });
    }

    // Set rate limit headers for successful requests too
    res.set({
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.floor(rateLimit.resetAt / 1000))
    });

    // Transform request
    const handler = new AnthropicRequestHandler(req.body);
    const openRouterRequest = handler.transformToOpenRouter();

    // Check if streaming is requested
    const isStreaming = req.body.stream ?? false;

    // Make request to OpenRouter
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Anthropic Proxy'
      },
      body: JSON.stringify(openRouterRequest)
    });

    if (!openRouterResponse.ok) {
      const error = await openRouterResponse.json();
      return res.status(openRouterResponse.status).json({
        error: {
          type: 'api_error',
          message: error.error?.message || 'OpenRouter API error'
        }
      });
    }

    if (isStreaming) {
      // Handle streaming response
      await handleStreamingResponse(openRouterResponse, res);
    } else {
      // Handle regular response
      const openRouterData = await openRouterResponse.json();
      const anthropicResponse = handler.transformToAnthropicResponse(openRouterData);
      res.json(anthropicResponse);
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: 'Internal server error'
      }
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      type: 'not_found',
      message: `Endpoint ${req.method} ${req.path} not found`
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AnthroRouter proxy server running on http://localhost:${PORT}`);
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/v1/messages`);
  console.log(`🔑 Test with x-api-key: test-api-key-123`);
});
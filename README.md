# AnthroRouter

A lightweight Express.js proxy that translates Anthropic's Messages API format to OpenRouter, enabling you to use any OpenRouter model with Anthropic-compatible clients.

## Features

- 🚀 **Lightweight** - Only 40MB of dependencies vs 300MB+ for similar solutions
- ⚡ **Fast** - Instant startup (~100ms) with minimal overhead
- 🔄 **Full Compatibility** - Complete Anthropic Messages API implementation
- 📡 **Streaming Support** - Real-time SSE streaming for responsive interactions
- 🔒 **Built-in Security** - API key validation and rate limiting (100 req/min)
- 🎯 **Simple** - One endpoint, clear code, easy to modify

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/anthrorouter.git
cd anthrorouter

# Install dependencies (only 40MB!)
npm install

# Copy environment variables
cp .env.example .env

# Add your OpenRouter API key to .env
# OPENROUTER_API_KEY=your_key_here
```

### Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Build for production
npm run build

# Run production server
npm start
```

The server will start on `http://localhost:3000` by default.

## API Usage

### Endpoint

```
POST http://localhost:3000/api/v1/messages
```

### Headers

```
Content-Type: application/json
x-api-key: your-api-key
```

### Request Example

```json
{
  "model": "google/gemini-2.0-flash-exp:free",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "max_tokens": 100,
  "temperature": 0.7,
  "stream": false,
  "system": "You are a helpful assistant"
}
```

### Response Example

```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'm doing well, thank you!"
    }
  ],
  "model": "google/gemini-2.0-flash-exp:free",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 15
  }
}
```

### Streaming

Set `"stream": true` in your request to receive Server-Sent Events:

```
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}
data: {"type":"message_stop"}
```

## Compatible Models

You can use any model available on OpenRouter. See [OpenRouter's model list](https://openrouter.ai/models) for all available options.

## Using with Anthropic SDK

You can use this proxy with the official Anthropic SDK:

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'your-api-key',
  baseURL: 'http://localhost:3000/api/v1'
});

const message = await anthropic.messages.create({
  model: 'google/gemini-2.0-flash-exp:free',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# Required - Your OpenRouter API key
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Optional - Comma-separated list of valid API keys for clients
VALID_API_KEYS=key1,key2,key3

# Optional - Server port (default: 3000)
PORT=3000

# Optional - Your site URL for OpenRouter analytics
SITE_URL=https://yoursite.com
```

### API Key Management

By default, the server accepts:
- Any key starting with `sk-ant-` and longer than 40 characters
- Keys listed in `VALID_API_KEYS` environment variable
- `test-api-key-123` for development

To customize authentication, edit `lib/auth.ts`.

### Rate Limiting

Default: 100 requests per minute per API key. Modify in `lib/auth.ts`:

```javascript
const RATE_LIMIT = 100; // Requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t anthrorouter .
docker run -p 3000:3000 --env-file .env anthrorouter
```

### PM2

```bash
npm run build
pm2 start dist/server.js --name anthrorouter
```

### Systemd

Create `/etc/systemd/system/anthrorouter.service`:

```ini
[Unit]
Description=AnthroRouter Proxy
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/anthrorouter
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Architecture

```
Client Application
      ↓
[Anthropic Format Request]
      ↓
Express Server (server.ts)
      ↓
Auth & Rate Limiting (lib/auth.ts)
      ↓
Request Handler (lib/request-handler.ts)
      ↓
[OpenRouter API Call]
      ↓
Response/Stream Handler (lib/streaming-handler.ts)
      ↓
[Anthropic Format Response]
      ↓
Client Application
```

## Performance

- **Startup Time**: ~100ms
- **Memory Usage**: ~30MB idle
- **Dependencies**: 40MB (vs 300MB+ for Next.js alternatives)
- **Latency Overhead**: <5ms for proxying

## Contributing

Contributions are welcome! This is a simple, focused project - let's keep it that way.

1. Fork the repository
2. Create your feature branch
3. Keep changes minimal and focused
4. Ensure the code remains simple and readable
5. Submit a pull request

## License

MIT - See LICENSE file for details

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/anthrorouter/issues)
- OpenRouter Docs: [openrouter.ai/docs](https://openrouter.ai/docs)
- Anthropic API Docs: [docs.anthropic.com](https://docs.anthropic.com)

---

Built with ❤️ for developers who value simplicity and performance.
import crypto from 'crypto';

// In-memory cache for API keys (in production, use Redis)
const apiKeyCache = new Map<string, { valid: boolean; userId?: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function validateApiKey(apiKey: string): Promise<boolean> {
  // Check cache first
  const cached = apiKeyCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.valid;
  }

  // For demo purposes, check if it's one of the valid keys
  const validKeys = process.env.VALID_API_KEYS?.split(',') || [];

  // Accept keys with specific prefix for testing
  const isValidFormat = apiKey.startsWith('sk-ant-') && apiKey.length > 40;
  const isInValidList = validKeys.includes(apiKey);
  const isTestKey = apiKey === 'test-api-key-123'; // Test key for development

  const isValid = isValidFormat || isInValidList || isTestKey;

  // Cache the result
  apiKeyCache.set(apiKey, {
    valid: isValid,
    expiresAt: Date.now() + CACHE_TTL
  });

  // Optional: Log API usage for analytics
  if (isValid && process.env.NODE_ENV === 'development') {
    console.log(`API key used: ${apiKey.substring(0, 10)}...`);
  }

  return isValid;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// Rate limiting implementation
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // Requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

export async function checkRateLimit(apiKey: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const keyHash = hashApiKey(apiKey);

  let limit = rateLimitMap.get(keyHash);

  if (!limit || limit.resetAt < now) {
    limit = {
      count: 0,
      resetAt: now + RATE_WINDOW
    };
    rateLimitMap.set(keyHash, limit);
  }

  limit.count++;

  const allowed = limit.count <= RATE_LIMIT;
  const remaining = Math.max(0, RATE_LIMIT - limit.count);

  return {
    allowed,
    remaining,
    resetAt: limit.resetAt
  };
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();

  // Clean up API key cache
  for (const [key, value] of apiKeyCache.entries()) {
    if (value.expiresAt < now) {
      apiKeyCache.delete(key);
    }
  }

  // Clean up rate limit map
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Run every minute
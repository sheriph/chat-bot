import Redis from "ioredis";

// Configure Redis client with fallback options
const getRedisUrl = () => {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  // Default to local Redis instance if no URL specified
  return "redis://localhost:6379";
};

// Create and export a Redis client singleton
export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Handle connection events
redis.on("error", (error) => {
  console.error("Redis connection error:", error);
});

redis.on("connect", () => {
  console.log("Connected to Redis");
});

// Key prefix to avoid collisions with other applications
const CHAT_PREFIX = "ngabroad:chat:";
const FLIGHT_PREFIX = "ngabroad:flight-offers:";

export const getChatKey = (id: string): string => {
  return `${CHAT_PREFIX}${id}`;
};

export const getFlightOffersKey = (id: string): string => {
  return `${FLIGHT_PREFIX}${id}`;
};
import WebSocket, { Server as WebSocketServer } from "ws";
import Redis from "ioredis";
import dotenv from "dotenv";

// Load environment variables based on the environment
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

// Redis client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// WebSocket server configuration
const wss = new WebSocketServer({ port: 8080 });
const channelSubscribers = new Map<string, Set<WebSocket>>(); // Track channel subscriptions

// Redis channel to subscribe
const REDIS_CHANNEL = "test-channel";

// Subscribe to the default Redis channel
redis.subscribe(REDIS_CHANNEL, (err, count) => {
  if (err) {
    console.error("Failed to subscribe to Redis channel:", err.message);
  } else {
    console.log(`Subscribed to ${count} channel(s). Listening for updates on "${REDIS_CHANNEL}"`);
  }
});

// Broadcast Redis messages to WebSocket clients
redis.on("message", (channel, message) => {
  if (channel === REDIS_CHANNEL) {
    console.log(`Message received from Redis: ${message}`);
    broadcastToAllClients(message);
  }
});

// Utility function to broadcast messages to all WebSocket clients
const broadcastToAllClients = (message: string) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket) => {
  console.log(`Client connected. Total clients: ${wss.clients.size}`);
  ws.send("Welcome to the WebSocket server!");

  ws.on("message", (data) => handleWebSocketMessage(ws, data));
  ws.on("close", () => handleWebSocketClose(ws));
});

// Handle incoming WebSocket messages
const handleWebSocketMessage = (ws: WebSocket, data: WebSocket.Data) => {
  try {
    const parsedData: ParsedData = JSON.parse(data.toString());
    const { action, channel, datum } = parsedData;

    switch (action) {
      case "message":
        if (datum) {
          broadcastToChannelSubscribers(channel, { action, channel, datum });
        } else {
          ws.send("Missing message content");
        }
        break;
      case "subscribe":
        subscribeToChannel(ws, channel);
        break;
      case "unsubscribe":
        unsubscribeFromChannel(ws, channel);
        break;
      default:
        ws.send("Invalid action");
    }
  } catch (error) {
    console.error("Error parsing WebSocket message:", error);
    ws.send("Error processing your request");
  }
};

// Broadcast a message to all subscribers of a specific channel
const broadcastToChannelSubscribers = (channel: string, message: Message) => {
  const clients = channelSubscribers.get(channel) || new Set();
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// Subscribe a WebSocket client to a channel
const subscribeToChannel = (ws: WebSocket, channel: string) => {
  if (!channelSubscribers.has(channel)) {
    channelSubscribers.set(channel, new Set());
    redis.subscribe(channel, (err) => {
      if (err) {
        console.error(`Failed to subscribe to Redis channel: ${channel}`, err);
      } else {
        console.log(`Subscribed to Redis channel: ${channel}`);
      }
    });
  }
  channelSubscribers.get(channel)!.add(ws);
  ws.send(`Subscribed to channel: ${channel}`);
};

// Unsubscribe a WebSocket client from a channel
const unsubscribeFromChannel = (ws: WebSocket, channel: string) => {
  const clients = channelSubscribers.get(channel);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      channelSubscribers.delete(channel);
      redis.unsubscribe(channel, (err) => {
        if (err) {
          console.error(`Failed to unsubscribe from Redis channel: ${channel}`, err);
        } else {
          console.log(`Unsubscribed from Redis channel: ${channel}`);
        }
      });
    }
  }
  ws.send(`Unsubscribed from channel: ${channel}`);
};

// Handle WebSocket disconnection
const handleWebSocketClose = (ws: WebSocket) => {
  console.log("Client disconnected");
  channelSubscribers.forEach((clients, channel) => {
    clients.delete(ws);
    if (clients.size === 0) {
      channelSubscribers.delete(channel);
      redis.unsubscribe(channel, (err) => {
        if (err) {
          console.error(`Failed to unsubscribe from Redis channel: ${channel}`, err);
        } else {
          console.log(`Unsubscribed from Redis channel: ${channel}`);
        }
      });
    }
  });
};

console.log("WebSocket server running on ws://localhost:8080");

// Interfaces for data structures
interface Message {
  channel: string;
  datum: string;
  action: string;
}

interface ParsedData {
  channel: string;
  datum?: string;
  action: string;
}

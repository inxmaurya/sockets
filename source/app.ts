import WebSocket, { Server as WebSocketServer } from "ws";
import Redis from "ioredis";

import dotenv from 'dotenv';
// Determine the environment and load the corresponding .env file
const envFile = `.env.${process.env.NODE_ENV}`;
// Load environment variables from .env file
dotenv.config({path: envFile});

// Redis Client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });

// Track WebSocket subscriptions
const channelSubscribers = new Map<string, Set<WebSocket>>(); // Channel -> WebSocket clients



interface Message {
  channel: string;
  datum: string;
  action: string;
}

interface parsedDataInterface {
  channel: string;
  datum?: string;
  action: string;
}


// Redis channel to subscribe to
const REDIS_CHANNEL = 'test-channel';
// Subscribe to the Redis channel
redis.subscribe(REDIS_CHANNEL, (err, count) => {
  if (err) {
    console.error('Failed to subscribe to Redis channel:', err.message);
  } else {
    console.log(`Subscribed to ${count} channel(s). Listening for updates on "${REDIS_CHANNEL}"`);
  }
});

// Broadcast messages from "REDIS" to WebSocket clients
redis.on('message', (channel, message) => {
  if (channel === REDIS_CHANNEL) {
    console.log(`Message received from Redis ----- : ${message}`);
    // Broadcast to all connected WebSocket clients
    wss.clients.forEach((client) => {
      console.log(message);
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
});

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket) => {
  ws.send('Welcome to the WebSocket server!');
  console.log(`Client connected. Total clients: ${wss.clients.size}`);
  ws.on("message", (data) => {
    try {
      const parsedData: parsedDataInterface = JSON.parse(data.toString());
      const action = parsedData.action;
      const channel = parsedData.channel;
      const datum = parsedData.datum || "";
      if (parsedData.action === "message" && parsedData.datum){
        // Broadcast messages from "WS" to WebSocket clients
        const clients = channelSubscribers.get(parsedData.channel) || new Set<WebSocket>();
        // const clients = wss.clients;
        const payload: Message = { channel: channel, action: action, datum: datum };

        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });
      }
      else if (parsedData.action === "subscribe" && parsedData.channel) {
        const channel = parsedData.channel;
        // Add the WebSocket client to the channel's subscribers
        if (!channelSubscribers.has(channel)) {
          channelSubscribers.set(channel, new Set());
          redis.subscribe(channel); // Subscribe to Redis if it's the first client
          console.log(`Subscribed to Redis channel: ${channel}`);
        }
        channelSubscribers.get(channel)?.add(ws);
        ws.send(`Subscribed to channel: ${channel}`);
      }
      else if (parsedData.action === "unsubscribe" && parsedData.channel) {
        const channel = parsedData.channel;
        // Remove the WebSocket client from the channel's subscribers
        const clients = channelSubscribers.get(channel);
        if (clients) {
          clients.delete(ws);
          // If no clients are left, unsubscribe from Redis
          if (clients.size === 0) {
            channelSubscribers.delete(channel);
            redis.unsubscribe(channel);
            console.log(`Unsubscribed from Redis channel: ${channel}`);
          }
        }
        ws.send(`Unsubscribed from channel: ${channel}`);
      }
      else {
        ws.send("Invalid action or missing channel");
      }
    }
    catch (error) {
      console.error("Error parsing WebSocket message:", error);
      ws.send("Error processing your request");
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    // Remove client from all subscribed channels
    channelSubscribers.forEach((clients, channel) => {
      clients.delete(ws);
      // If no clients are left, unsubscribe from Redis
      if (clients.size === 0) {
        channelSubscribers.delete(channel);
        redis.unsubscribe(channel);
        console.log(`Unsubscribed from Redis channel: ${channel}`);
      }
    });
  });

  ws.send("Welcome to the WebSocket server!");
});

console.log("WebSocket server running on ws://localhost:8080");

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importStar(require("ws"));
const ioredis_1 = __importDefault(require("ioredis"));
// Create Redis client
const redis = new ioredis_1.default();
// Create WebSocket server
const wss = new ws_1.Server({ port: 8080 });
// Track WebSocket subscriptions
const channelSubscribers = new Map(); // Channel -> WebSocket clients
// Redis channel to subscribe to
const REDIS_CHANNEL = 'test-channel';
// Subscribe to the Redis channel
redis.subscribe(REDIS_CHANNEL, (err, count) => {
    if (err) {
        console.error('Failed to subscribe to Redis channel:', err.message);
    }
    else {
        console.log(`Subscribed to ${count} channel(s). Listening for updates on "${REDIS_CHANNEL}"`);
    }
});
// Broadcast messages from "REDIS" to WebSocket clients
redis.on('message', (channel, message) => {
    if (channel === REDIS_CHANNEL) {
        console.log(`Message received from Redis ----- : ${message}`);
        // Broadcast to all connected WebSocket clients
        wss.clients.forEach((client) => {
            console.log(client);
            if (client.readyState === ws_1.default.OPEN) {
                client.send(message);
            }
        });
    }
});
// Handle WebSocket connections
wss.on("connection", (ws) => {
    ws.send('Welcome to the WebSocket server!');
    console.log(`Client connected. Total clients: ${wss.clients.size}`);
    ws.on("message", (data) => {
        var _a;
        try {
            const parsedData = JSON.parse(data.toString());
            const action = parsedData.action;
            const channel = parsedData.channel;
            const datum = parsedData.datum || "";
            if (parsedData.action === "message" && parsedData.datum) {
                // Broadcast messages from "WS" to WebSocket clients
                const clients = channelSubscribers.get(parsedData.channel) || new Set();
                // const clients = wss.clients;
                const payload = { channel: channel, action: action, datum: datum };
                clients.forEach((client) => {
                    if (client.readyState === ws_1.default.OPEN) {
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
                (_a = channelSubscribers.get(channel)) === null || _a === void 0 ? void 0 : _a.add(ws);
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

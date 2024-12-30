const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const client = new Client();

// Set up WebSocket server to broadcast QR code to the frontend
const wss = new WebSocket.Server({ noServer: true });

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Broadcast QR code to all connected WebSocket clients
client.on('qr', (qr) => {
    // Generate QR code and send it to the WebSocket clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(qr);
        }
    });
});

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    ws.on('message', (message) => {
        console.log(`Received message: ${message}`);
    });
});

// Initialize WhatsApp client and handle ready state
client.on('ready', () => {
    console.log('WhatsApp is ready!');
});

// Initialize the WhatsApp client
client.initialize();

// Handle sending messages
app.get('/send-message', (req, res) => {
    const { phoneNumber, message } = req.query;
    if (!phoneNumber || !message) {
        return res.status(400).send("Missing phone number or message");
    }

    const number = phoneNumber + '@c.us';
    client.sendMessage(number, message)
        .then(response => {
            res.json({ success: true, message: response });
        })
        .catch(err => {
            res.status(500).json({ success: false, error: err });
        });
});

// Create server with WebSocket support
const server = app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

// Upgrade the HTTP server to handle WebSocket connections
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

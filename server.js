const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 1221;

// Middleware
app.use(express.json());
app.use(cors());

// WhatsApp Client Initialization
let clientReady = false;
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // Set to true for production
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
});

client.on("qr", (qr) => {
    console.log("QR Code received. Scan it to connect:");
    console.log(qr); // You can generate a QR code display if needed
});

client.on("authenticated", () => {
    console.log("WhatsApp authenticated successfully!");
});

client.on("ready", () => {
    console.log("WhatsApp Client is ready!");
    clientReady = true;
});

client.on("disconnected", (reason) => {
    console.log("WhatsApp Client disconnected:", reason);
    clientReady = false;
    client.initialize(); // Reinitialize on disconnect
});

// Initialize WhatsApp Client
client.initialize();

// Serve Frontend
app.use(express.static(path.join(__dirname, "public")));

// API Endpoint for WhatsApp Web Redirect
app.get("/redirect", (req, res) => {
    if (!clientReady) {
        return res.status(500).json({
            success: false,
            message: "WhatsApp client is not ready. Try again later.",
        });
    }
    res.redirect("https://web.whatsapp.com/");
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

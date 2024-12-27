const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const cors = require("cors");
const path = require("path");
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Add stealth plugin to Puppeteer
puppeteerExtra.use(StealthPlugin());

const app = express();
let clientReady = false;
let qrCode = null;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "./public")));
app.use(express.json());

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "/usr/bin/google-chrome", // Path to Chrome/Chromium
        headless: true, // Run without GUI
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        puppeteer: puppeteerExtra, // Use PuppeteerExtra with stealth plugin
    },
});

// Event Listeners
client.on("qr", (qr) => {
    console.log("QR Code received. Scan it using your WhatsApp app.");
    qrCode = qr;
});

client.on("ready", () => {
    console.log("WhatsApp client is ready.");
    clientReady = true;
    qrCode = null; // Clear QR code once ready
});

client.on("disconnected", (reason) => {
    console.log("WhatsApp client disconnected:", reason);
    clientReady = false;
});

// Initialize WhatsApp Client
client.initialize();

// API Endpoints

// Endpoint to get the QR code
app.get("/get-qr-code", (req, res) => {
    if (!qrCode) {
        return res.status(400).json({ success: false, message: "QR Code not available. Please retry." });
    }
    res.json({ success: true, qrCode });
});

// Endpoint to check if the client is ready
app.get("/client-ready", (req, res) => {
    res.json({ success: true, clientReady });
});

// Start the server
const PORT = 1221;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

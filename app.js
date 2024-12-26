const { Client, LocalAuth } = require("whatsapp-web.js");

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Ensure Puppeteer runs in headless mode
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process", // Run browser in a single process
            "--disable-gpu",
        ],
    },
});

client.on("qr", (qr) => {
    console.log("QR Code received:", qr);
});

client.on("authenticated", () => {
    console.log("WhatsApp authenticated successfully!");
});

client.on("ready", () => {
    console.log("WhatsApp Client is ready!");
});

client.initialize();

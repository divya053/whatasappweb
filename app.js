const { Client, LocalAuth } = require("whatsapp-web.js");

let client = new Client({
    authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
    console.log("QR Code received: ", qr);
});

client.on("authenticated", () => {
    console.log("WhatsApp authenticated successfully!");
});

client.on("ready", () => {
    console.log("WhatsApp Client is ready!");
});

client.initialize();

module.exports = client;

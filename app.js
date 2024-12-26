const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const readExcel = require("read-excel-file/node");
const sqlite3 = require("sqlite3").verbose();
const { Client, LocalAuth } = require("whatsapp-web.js");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment-timezone");
const puppeteer = require('puppeteer'); // Add Puppeteer for launching browser
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const upload = multer({ dest: "uploads/" });
let client;
let clientReady = false;

// Initialize WhatsApp client with Puppeteer configured for localhost only
client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,  // Set to false to see the browser
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
    },
});

client.initialize();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// SQLite database setup
const db = new sqlite3.Database("./mobileData.db");
app.use(bodyParser.json());

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ip_address TEXT,
            login_time TEXT,
            logout_time TEXT,
            session_status TEXT,
            unique_sessionid TEXT UNIQUE NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT NOT NULL,
            status TEXT NOT NULL,
            date TEXT NOT NULL
        )
    `);

    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'admin123')`);
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('user1', 'user123')`);
});

// Middleware
app.use(express.static(path.join(__dirname, "./public")));

// WhatsApp Client Events
client.on("qr", (qr) => {
    console.log("QR Code received. Please scan it using your WhatsApp.");
});

client.on("authenticated", () => {
    console.log("WhatsApp client authenticated successfully.");
});

client.on("ready", () => {
    console.log("WhatsApp client is ready.");
    clientReady = true;
});

client.on("disconnected", (reason) => {
    console.log("WhatsApp client disconnected:", reason);
    clientReady = false;
});

// Login Endpoint
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const loginTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const uniqueSessionId = uuidv4();

    db.get(
        "SELECT * FROM users WHERE username = ? AND password = ?",
        [username, password],
        (err, user) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Database error." });
            }
            if (!user) {
                return res.status(401).json({ success: false, message: "Invalid username or password." });
            }

            db.run(
                `INSERT INTO user_sessions (user_id, ip_address, login_time, session_status, unique_sessionid)
                 VALUES (?, ?, ?, ?, ?)`,
                [user.id, ipAddress, loginTime, "active", uniqueSessionId],
                (insertErr) => {
                    if (insertErr) {
                        return res.status(500).json({ success: false, message: "Error creating session." });
                    }
                    res.json({ success: true, message: "Login successful.", sessionId: uniqueSessionId });
                }
            );
        }
    );
});

// Logout Endpoint
app.post("/logout", (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ success: false, message: "Session ID is required." });
    }

    const logoutTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    db.run(
        `UPDATE user_sessions SET logout_time = ?, session_status = ? WHERE unique_sessionid = ? AND session_status = ?`,
        [logoutTime, "inactive", sessionId, "active"],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Error updating logout data." });
            }
            if (this.changes === 0) {
                return res.status(400).json({ success: false, message: "No active session found for this session ID." });
            }
            res.json({ success: true, message: "Logout successful." });
        }
    );
});

// Upload Excel File and Check WhatsApp Numbers
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded. Please upload a valid Excel file." });
    }

    if (!clientReady) {
        return res.status(500).json({
            success: false,
            message: "WhatsApp Client is not ready. Please ensure it is connected and try again.",
        });
    }

    const filePath = req.file.path;

    try {
        const data = await readExcel(filePath);
        const outputData = [];
        const currentDate = new Date().toISOString();

        for (const row of data) {
            const number = row[0];
            const chatId = number.substring(1) + "@c.us";

            try {
                const isRegistered = await client.isRegisteredUser(chatId);
                const status = isRegistered ? "Available on WhatsApp" : "Not available on WhatsApp";

                db.run(
                    `INSERT INTO status (number, status, date) VALUES (?, ?, ?)`,
                    [number, status, currentDate],
                    (err) => {
                        if (err) {
                            console.error(`Error saving number ${number}:`, err);
                        }
                    }
                );

                outputData.push({ number, status });
            } catch (error) {
                outputData.push({ number, status: "Error checking status" });
            }
        }

        res.json({ success: true, data: outputData });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error reading the file. Please ensure it is a valid Excel file.",
        });
    } finally {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting uploaded file:", err);
            }
        });
    }
});

// Endpoint to open WhatsApp Web in the same host machine's default browser

// Endpoint to open WhatsApp Web on the server's Chromium
app.get("/whatsapp", async (req, res) => {
    if (!clientReady) {
        return res.status(500).json({
            success: false,
            message: "WhatsApp Client is not ready. Please ensure it is connected and try again.",
        });
    }

    try {
        // Launch Puppeteer with Chromium in headless mode (no GUI)
        const browser = await puppeteer.launch({
            headless: true,  // Run Chromium in headless mode (no GUI)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        // Open WhatsApp Web in the server's headless browser
        const page = await browser.newPage();
        await page.goto('https://web.whatsapp.com/');
        
        // Wait for a few seconds to ensure the page loads
        await page.waitForTimeout(5000);  // Adjust the timeout if necessary

        // Close the browser after opening WhatsApp Web
        await browser.close();
        
        // Respond to the frontend
        res.json({ success: true, message: "WhatsApp Web opened successfully on the server." });
    } catch (error) {
        console.error("Error opening WhatsApp Web:", error);
        res.status(500).json({ success: false, message: "Failed to open WhatsApp Web on the server." });
    }
});


// Start the Server
app.listen(1221, () => {
    console.log("Server running on http://localhost:1221");
});

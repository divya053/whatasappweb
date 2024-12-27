const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const readExcel = require("read-excel-file/node");
const ExcelJS = require("exceljs");
const sqlite3 = require("sqlite3").verbose();
const { Client, LocalAuth } = require("whatsapp-web.js");
const { v4: uuidv4 } = require("uuid");
const XLSX = require('xlsx');
const moment = require('moment-timezone');
const app = express();
const bodyParser = require("body-parser");

const upload = multer({ dest: "uploads/" });
const cors = require('cors');
let client;
let clientReady = false;

// Initialize WhatsApp client
client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: false },
   
});

client.initialize();
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

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

    // Insert sample users
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'admin123')`);
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('user1', 'user123')`);
});

// Serve static frontend
app.use(express.static(path.join(__dirname, "./public")));

// Middleware
app.use(express.json());

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

            // Insert session details into user_sessions
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

// app.post("/upload", upload.single("file"), async (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ success: false, message: "No file uploaded" });
//     }
//     const filePath = req.file.path;
//     if (!clientReady) {
//         return res.status(500).json({ success: false, message: "WhatsApp Client is not ready. Try again later." });
//     }

//     const data = await readExcel(filePath);
//     const outputData = [];

//     // Current date to store with each record
//     const currentDate = new Date().toISOString();

//     for (const row of data) {
//         const number = row[0];
//         const chatId = number.substring(1) + "@c.us";

//         try {
//             const isRegistered = await client.isRegisteredUser(chatId);
//             const status = isRegistered ? "Available on WhatsApp" : "Not available on WhatsApp";
//             outputData.push({ number, status });

//             // Save to database
//             db.run(
//                 `INSERT INTO status (number, status, date) VALUES (?, ?, ?)`,
//                 [number, status, currentDate],
//                 (err) => {
//                     if (err) {
//                         console.error(`Error saving number ${number}:`, err);
//                     }
//                 }
//             );
//         } catch (error) {
//             console.error(`Error processing number ${number}:`, error);
//             outputData.push({ number, status: "Error checking status" });
//         }
//     }

//     res.json({ success: true, data: outputData });
// });
// Endpoint to upload Excel file
app.post("/upload", upload.single("file"), async (req, res) => {
    console.log("Upload route triggered");  // Add this line to check if the route is hit
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
    console.log("File uploaded:", filePath); // Check if the file is uploaded

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

                // Save to database
                db.run(
                    `INSERT INTO status (number, status, date) VALUES (?, ?, ?)`,
                    [number, status, currentDate],
                    (err) => {
                        if (err) {
                            console.error(`Error saving number ${number}:`, err); // Log error to debug
                        }
                    }
                );

                outputData.push({ number, status });
            } catch (error) {
                console.error(`Error processing number ${number}:`, error);
                outputData.push({ number, status: "Error checking status" });
            }
        }

        res.json({ success: true, data: outputData });
    } catch (error) {
        console.error("Error reading the uploaded file:", error);
        res.status(500).json({
            success: false,
            message: "Error reading the file. Please ensure it is a valid Excel file.",
        });
    } finally {
        // Clean up uploaded file after processing
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting uploaded file:", err);
            }
        });
    }
});

// Endpoint to view complete database content

app.get("/view", (req, res) => {
    db.all("SELECT * FROM status ORDER BY date DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error fetching data from the database." });
        }

        rows.forEach(row => {
            // Using moment-timezone to adjust the date to IST
            const formattedDate = moment(row.date).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm:ss');

            // Update the date field with the formatted value
            row.date = formattedDate;
        });

        res.json({ success: true, data: rows });
    });
});



app.post("/delete", (req, res) => {
    const { ids } = req.body;

    if (!ids || ids.length === 0) {
        return res.status(400).json({ success: false, message: "No IDs provided." });
    }

    // Prepare the SQL query for deleting rows
    const placeholders = ids.map(() => "?").join(", ");
    const sql = `DELETE FROM status WHERE id IN (${placeholders})`;

    // Execute the query
    db.run(sql, ids, function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: "Error deleting data", error: err });
        }
        res.json({ success: true, message: `${this.changes} row(s) deleted.` });
    });
});


// Start server
app.listen(1221, () => {
    console.log("Server running on http://localhost:1221");
});  

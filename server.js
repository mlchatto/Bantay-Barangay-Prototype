const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const twilio = require("twilio");

require("dotenv").config();

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const app = express();
const PORT = 3000;

// ===============================
// MIDDLEWARE

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public", "citizen")));
app.use(express.static(path.join(__dirname, "public", "official")));

// ===============================
// DATABASE

const db = new Database("./database/barangay.db");

console.log("Connected to SQLite database.");

db.exec(`
    CREATE TABLE IF NOT EXISTS concerns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_number TEXT NOT NULL,
        citizen_name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        concern TEXT NOT NULL,
        status TEXT NOT NULL,
        official_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log("Concerns table is ready.");

// ===============================
// CITIZEN SUBMITS CONCERN
// ===============================

app.post("/api/concerns", (req, res) => {

    const { name, phone, concern } = req.body;

    // Check that all required information was provided

    if (!name || !phone || !concern) {

        return res.status(400).json({
            success: false,
            message: "Name, phone number, and concern are required."
        });

    }

    // Generate a reference number

    const year = new Date().getFullYear();

    const referenceNumber =
        `BC-${year}-${Date.now()}`;

    // Save the concern to SQLite

    const insertConcern = db.prepare(`
        INSERT INTO concerns (
            reference_number,
            citizen_name,
            phone_number,
            concern,
            status
        )
        VALUES (
            @referenceNumber,
            @name,
            @phone,
            @concern,
            @status
        )
    `);

    const result = insertConcern.run({
        referenceNumber: referenceNumber,
        name: name,
        phone: phone,
        concern: concern,
        status: "NEW"
    });

    console.log("New concern saved to database.");
    console.log("Database ID:", result.lastInsertRowid);
    console.log("Reference:", referenceNumber);
    console.log("Name:", name);
    console.log("Phone:", phone);
    console.log("Concern:", concern);


    // Send response back to citizen's browser

    res.json({
        success: true,
        referenceNumber: referenceNumber,
        message: "Your concern was submitted successfully."
    });

});

app.get("/api/concerns", (req, res) => {

    const concerns = db.prepare(`
        SELECT *
        FROM concerns
        ORDER BY created_at DESC
    `).all();

    res.json(concerns);
});

app.put("/api/concerns/:id", (req, res) => {

    const { id } = req.params;
    const { status, officialResponse } = req.body;

    if (!status) {
        return res.status(400).json({
            success: false,
            message: "Status is required."
        });
    }

    const updateConcern = db.prepare(`
        UPDATE concerns
        SET
            status = @status,
            official_response = @officialResponse
        WHERE id = @id
    `);

    const result = updateConcern.run({
        id: id,
        status: status,
        officialResponse: officialResponse || null
    });

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            message: "Concern not found."
        });
    }

    console.log("Concern updated.");
    console.log("ID:", id);
    console.log("Status:", status);
    console.log("Official response:", officialResponse);

    res.json({
        success: true,
        message: "Concern updated successfully."
    });
});

// Twilio

app.get("/api/test-sms", async (req, res) => {
    try {

        const message = await twilioClient.messages.create({
            body: "Bantay Barangay test SMS. Your Twilio connection is working!",
            from: process.env.TWILIO_PHONE_NUMBER,
            to: "YOUR_PHONE_NUMBER"
        });

        console.log("SMS sent successfully.");
        console.log("Message SID:", message.sid);

        res.json({
            success: true,
            message: "Test SMS sent successfully.",
            sid: message.sid
        });

    } catch (error) {

        console.error("Twilio error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to send test SMS.",
            error: error.message
        });

    }

});

// ===============================
// START SERVER

app.listen(PORT, () => {

    console.log(`Server running at http://localhost:${PORT}`);
});
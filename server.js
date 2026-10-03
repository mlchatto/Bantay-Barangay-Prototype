const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// MIDDLEWARE

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve citizen files
app.use(
    express.static(
        path.join(__dirname, "public", "citizen")
    )
);

// Sessions
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false
        }
    })
);

// Protect official pages
app.use("/official", (req, res, next) => {

    // These files can be accessed without logging in
    const publicFiles = [
        "/login.html",
        "/login.js",
        "/logstyle.css"
    ];

    if (publicFiles.includes(req.path)) {
        return next();
    }

    // Everything else requires an official session
    if (!req.session || !req.session.official) {
        return res.redirect("/official/login.html");
    }

    next();
});

// Serve official files
app.use(
    "/official",
    express.static(
        path.join(__dirname, "public", "official")
    )
);

// ======================================================
// PAGES

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "citizen",
            "index.html"
        )
    );

});

app.get("/official", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "official",
            "dashboard.html"
        )
    );

});

// ======================================================
// DATABASE

const db = new Database(
    "./database/barangay.db"
);

console.log(
    "Connected to SQLite database."
);

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

console.log(
    "Concerns table is ready."
);

// ======================================================
// ADD URGENCY FIELDS

try {

    db.exec(`
        ALTER TABLE concerns
        ADD COLUMN urgency_level TEXT DEFAULT 'UNASSESSED'
    `);

} catch (error) {

    // Column already exists
}

try {

    db.exec(`
        ALTER TABLE concerns
        ADD COLUMN urgency_reason TEXT
    `);

} catch (error) {
    // Column already exists
}

// ======================================================
// OFFICIAL ACCOUNTS

db.exec(`
    CREATE TABLE IF NOT EXISTS officials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        position TEXT,
        phone_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log(
    "Officials table is ready."
);

// ======================================================
// CREATE DEFAULT OFFICIAL ACCOUNT

const existingOfficial = db
    .prepare("SELECT id FROM officials LIMIT 1")
    .get();

if (!existingOfficial) {

    const defaultPassword = "password";

    const passwordHash = bcrypt.hashSync(
        defaultPassword,
        10
    );

    db.prepare(`
        INSERT INTO officials (
            username,
            password_hash,
            full_name,
            position
        )
        VALUES (?, ?, ?, ?)
    `).run(
        "official",
        passwordHash,
        "Barangay Official",
        "Barangay Official"
    );

    console.log(
        "Default official account created."
    );
}

// ======================================================
// OFFICIAL LOGIN

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    // Check that both fields were provided
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required."
        });
    }

    // Find the official account
    const official = db
        .prepare(`
            SELECT *
            FROM officials
            WHERE username = ?
        `)
        .get(username);

    // Username doesn't exist
    if (!official) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
        });
    }

    // Check the password
    const passwordMatches = await bcrypt.compare(
        password,
        official.password_hash
    );

    // Password is incorrect
    if (!passwordMatches) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
        });
    }

    // Login successful
    req.session.official = {
        id: official.id,
        username: official.username,
        fullName: official.full_name,
        position: official.position
    };

    res.json({
        success: true,
        message: "Login successful."
    });
});

app.post("/api/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to log out."
            });
        }

        res.json({
            success: true,
            message: "Logged out successfully."
        });

    });

});

// ======================================================
// PHILSMS FUNCTION

async function sendSMS(phoneNumber, message) {

    try {

        // Check if API token exists
        if (!process.env.PHILSMS_API_TOKEN) {

            console.error(
                "PHILSMS_API_TOKEN is missing from .env"
            );

            return {
                success: false,
                error: "PhilSMS API token is missing."
            };
        }

        // Check if Sender ID exists
        if (!process.env.PHILSMS_SENDER_ID) {

            console.error(
                "PHILSMS_SENDER_ID is missing from .env"
            );

            return {
                success: false,
                error: "PhilSMS Sender ID is missing."
            };
        }

        // Convert Philippine number to international format
        let recipient = phoneNumber
            .toString()
            .trim();

        if (recipient.startsWith("09")) {
            recipient =
                "63" + recipient.substring(1);
        }

        else if (recipient.startsWith("+63")) {
            recipient =
                recipient.substring(1);
        }

        // Send SMS to PhilSMS
        const response = await fetch(
            "https://app.philsms.com/api/v3/sms/send",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${process.env.PHILSMS_API_TOKEN}`,

                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json"
                },

                body: JSON.stringify({

                    recipient:
                        recipient,

                    sender_id:
                        process.env.PHILSMS_SENDER_ID,

                    type:
                        "plain",

                    message:
                        message

                })
            }
        );

        const data =
            await response.json();

        console.log(
            "PhilSMS response:",
            data
        );

        if (!response.ok) {
            return {
                success: false,
                data: data
            };
        }

        // PhilSMS normally returns:
        // { status: "success", data: ... }

        if (data.status !== "success") {

            return {
                success: false,
                data: data
            };
        }

        return {

            success: true,
            data: data

        };

    } catch (error) {

        console.error(
            "PhilSMS error:",
            error
        );

        return {
            success: false,
            error:
                error.message
        };
    }
}

// ======================================================
// TEST SERVER

app.get("/api/test", (req, res) => {
    res.json({

        success: true,
        message:
            "Barangay Concern System server is working!"

    });
});

// ======================================================
// TEST PHILSMS

app.get("/api/test-sms", async (req, res) => {

    const testPhone =
        req.query.phone;


    if (!testPhone) {

        return res.status(400).json({
            success: false,
            message:
                "Please provide a phone number."
        });
    }

    const message =
        "Bantay Barangay: SMS connection test successful.";

    const result =
        await sendSMS(
            testPhone,
            message
        );

    if (!result.success) {
        return res.status(500).json({
            success: false,
            message:
                "SMS failed to send.",
            details:
                result
        });
    }

    res.json({
        success: true,
        message:
            "SMS sent successfully.",
        details:
            result.data
    });
});

// ======================================================
// SUBMIT CITIZEN CONCERN

app.post("/api/concerns", async (req, res) => {

    const {
        name,
        phone,
        concern
    } = req.body;


    // Validate input
    if (!name || !phone || !concern) {
        return res.status(400).json({
            success: false,
            message:
                "Name, phone number, and concern are required."
        });

    }

    // Generate reference number
    const year =
        new Date().getFullYear();


    const referenceNumber =
        `BC-${year}-${Date.now()}`;

    // ==================================================
    // SAVE TO DATABASE

    const insertConcern =
    db.prepare(`
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

    const result =
    insertConcern.run({

        referenceNumber:
            referenceNumber,

        name:
            name,

        phone:
            phone,

        concern:
            concern,

        status:
            "NEW"

    });

    console.log(
        "New concern saved to database."
    );

    console.log(
        "Database ID:",
        result.lastInsertRowid
    );

    console.log(
        "Reference:",
        referenceNumber
    );

// ==================================================
// AI URGENCY CLASSIFICATION

const urgencyResult =
    await classifyUrgency(concern);

console.log(
    "AI urgency:",
    urgencyResult.urgency
);

console.log(
    "AI reason:",
    urgencyResult.reason
);

// Save AI result to database

db.prepare(`
    UPDATE concerns
    SET
        urgency_level = ?,
        urgency_reason = ?
    WHERE id = ?
`).run(
    urgencyResult.urgency,
    urgencyResult.reason,
    result.lastInsertRowid
);

    // ==================================================
    // SMS TO CITIZEN

    const citizenMessage =

        `Bantay Barangay: Your concern has been submitted successfully. Reference Number: ${referenceNumber}. Please keep this number for tracking.`;

    const citizenSMS =
        await sendSMS(
            phone,
            citizenMessage
        );

    // ==================================================
    // SMS TO BARANGAY OFFICIAL

    let officialSMS = null;

    if (process.env.BARANGAY_OFFICIAL_PHONE) {

        const officialMessage =

            `Bantay Barangay: New concern received. Reference: ${referenceNumber}. Citizen: ${name}. Please check the official dashboard.`;

        officialSMS =
            await sendSMS(

                process.env.BARANGAY_OFFICIAL_PHONE,

                officialMessage
            );
    }

    // ==================================================
    // RESPONSE

    res.json({

        success: true,

        referenceNumber:
            referenceNumber,

        message:
            "Your concern was submitted successfully.",

        smsSent:
            citizenSMS.success,

        officialNotified:
            officialSMS
                ? officialSMS.success
                : false
    });
});

// ======================================================
// OLLAMA CLOUD URGENCY CLASSIFICATION

async function classifyUrgency(concernText) {

    try {

        if (!process.env.OLLAMA_API_KEY) {

            console.error(
                "OLLAMA_API_KEY is missing."
            );

            return {
                success: false,
                urgency: "UNASSESSED",
                reason: "AI classification is not configured."
            };

        }

        const prompt = `
You are an urgency classification assistant for a barangay
concern reporting system.

Analyze the citizen's concern and classify it into exactly
one of these three urgency levels:

HIGH
MEDIUM
LOW

HIGH:
Immediate or potentially serious threat to life, safety,
health, major property damage, violence, fire, or another
situation that may require urgent attention.

MEDIUM:
A significant community problem that should receive attention
but does not appear to involve an immediate threat to life
or safety.

LOW:
A routine request, minor issue, administrative concern,
information request, or issue that does not appear urgent.

Return ONLY valid JSON in exactly this format:

{
  "urgency": "HIGH",
  "reason": "Short explanation"
}

Citizen concern:

${concernText}
`;

        const response = await fetch(
            "https://ollama.com/api/chat",
            
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.OLLAMA_API_KEY}`
                },

                body: JSON.stringify({
                    model: "gpt-oss:20b-cloud",
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    stream: false,
                    format: "json"
                })
            }
        );

        if (!response.ok) {

            const errorText = await response.text();

            throw new Error(
                `Ollama Cloud returned HTTP ${response.status}: ${errorText}`
            );
        }

        const data = await response.json();

        const result =
            JSON.parse(data.message.content);

        const allowedLevels = [
            "HIGH",
            "MEDIUM",
            "LOW"
        ];

        if (!allowedLevels.includes(result.urgency)) {

            throw new Error(
                "Ollama returned an invalid urgency level."
            );

        }

        return {
            success: true,
            urgency: result.urgency,
            reason: result.reason || ""
        };

    } catch (error) {

        console.error(
            "Ollama Cloud urgency error:",
            error
        );

        return {
            success: false,
            urgency: "UNASSESSED",
            reason: "Unable to classify concern automatically."
        };
    }
}

// ======================================================
// REQUIRE OFFICIAL LOGIN

function requireOfficial(req, res, next) {

    if (!req.session.official) {
        return res.status(401).json({
            success: false,
            message: "You must be logged in as an official."
        });
    }

    next();
}

// ======================================================
// GET OFFICIAL PROFILE

app.get("/api/profile", requireOfficial, (req, res) => {

    const officialId = req.session.official.id;

    const official = db.prepare(`
        SELECT
            id,
            username,
            full_name,
            position,
            phone_number
        FROM officials
        WHERE id = ?
    `).get(officialId);

    if (!official) {
        return res.status(404).json({
            success: false,
            message: "Official account not found."
        });
    }

    res.json({
        success: true,
        official: official
    });
});

// ======================================================
// UPDATE OFFICIAL PROFILE

app.put("/api/profile", requireOfficial, (req, res) => {

    const officialId = req.session.official.id;

    const {
        fullName,
        position,
        phoneNumber
    } = req.body;

    // Validate required fields
    if (!fullName || !position) {
        return res.status(400).json({
            success: false,
            message: "Full name and position are required."
        });
    }

    const result = db.prepare(`
        UPDATE officials
        SET
            full_name = ?,
            position = ?,
            phone_number = ?
        WHERE id = ?
    `).run(
        fullName,
        position,
        phoneNumber || null,
        officialId
    );

    if (result.changes === 0) {
        return res.status(404).json({
            success: false,
            message: "Official account not found."
        });
    }

    // Update the session too
    req.session.official.fullName = fullName;
    req.session.official.position = position;

    res.json({
        success: true,
        message: "Profile updated successfully."
    });
});

// ======================================================
// UPDATE OFFICIAL ACCOUNT CREDENTIALS

app.put("/api/profile/account", requireOfficial, async (req, res) => {

    const officialId = req.session.official.id;

    const {
        username,
        currentPassword,
        newPassword
    } = req.body;

    // Check required fields
    if (!username || !currentPassword) {
        return res.status(400).json({
            success: false,
            message: "Username and current password are required."
        });
    }

    // Find the currently logged-in official
    const official = db.prepare(`
        SELECT *
        FROM officials
        WHERE id = ?
    `).get(officialId);

    if (!official) {
        return res.status(404).json({
            success: false,
            message: "Official account not found."
        });
    }

    // Verify current password
    const passwordMatches = await bcrypt.compare(
        currentPassword,
        official.password_hash
    );

    if (!passwordMatches) {
        return res.status(401).json({
            success: false,
            message: "Current password is incorrect."
        });
    }

    // Check whether the new username is already being used
    const existingUsername = db.prepare(`
        SELECT id
        FROM officials
        WHERE username = ?
        AND id != ?
    `).get(username, officialId);

    if (existingUsername) {
        return res.status(409).json({
            success: false,
            message: "That username is already taken."
        });
    }

    // If no new password was provided,
    // keep the existing password
    let passwordHash = official.password_hash;

    if (newPassword) {

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 8 characters long."
            });
        }

        passwordHash = await bcrypt.hash(
            newPassword,
            10
        );
    }

    // Update account
    db.prepare(`
        UPDATE officials
        SET
            username = ?,
            password_hash = ?
        WHERE id = ?
    `).run(
        username,
        passwordHash,
        officialId
    );

    // Update current session
    req.session.official.username = username;

    res.json({
        success: true,
        message: "Account credentials updated successfully."
    });
});

// ======================================================
// GET ALL CONCERNS

app.get("/api/concerns", requireOfficial, (req, res) => {

    const concerns =
        db.prepare(`

            SELECT *
            FROM concerns
            ORDER BY created_at DESC

        `).all();
    res.json({
        concerns
    });
});

// ======================================================
// UPDATE CONCERN

app.put("/api/concerns/:id", requireOfficial, (req, res) => {

    const {
        id
    } = req.params;

    const {
        status,
        officialResponse
    } = req.body;

    if (!status) {
        return res.status(400).json({

            success: false,
            message:
                "Status is required."
        });
    }

    const updateConcern =
        db.prepare(`

            UPDATE concerns
            SET

                status = @status,
                official_response =
                    @officialResponse

            WHERE id = @id
        `);

    const result =
        updateConcern.run({

            id:
                id,

            status:
                status,

            officialResponse:
                officialResponse || null

        });

    if (result.changes === 0) {

        return res.status(404).json({

            success: false,
            message:
                "Concern not found."
        });

    }

    console.log(
        "Concern updated."
    );

    console.log(
        "ID:",
        id
    );

    console.log(
        "Status:",
        status
    );

    console.log(
        "Official response:",
        officialResponse
    );

    res.json({

        success: true,

        message:
            "Concern updated successfully."
    });
});

// ======================================================
// START SERVER

HEAD
app.listen(
    PORT,
    () => {
        console.log(
            `Server running at http://localhost:${PORT}`
        );

    }
);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bantay AI server running on port ${PORT}`);
});

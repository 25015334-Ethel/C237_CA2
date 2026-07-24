require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const flash = require("connect-flash");
const multer = require("multer");

// Store uploaded images inside public/images
const upload = multer({
    dest: "public/images"
});

const app = express();

// ======================
// Database Connection
// ======================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  
  ssl: {
    rejectUnauthorized: false
  }
});

pool.getConnection((err, connection) => {

    if (err) {
        console.error("Database connection failed:", err);
        return;
    }

    console.log("Connected to database");

    connection.release();

});

// ======================
// Middleware
// ======================
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

app.use(session({
    secret: "travelplanner",
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(flash());

app.set("view engine", "ejs");

// ======================
// Login Middleware
// ======================
function checkAuthenticated(req, res, next) {

    if (req.session.user) {
        return next();
    }

    req.flash("error", "Please login first.");
    res.redirect("/login");
}

// ======================
// Admin Role Middleware
// ======================

function checkAdmin(req, res, next) {

    if (
        req.session.user &&
        req.session.user.role === "admin"
    ) {

        return next();

    }

    req.flash(
        "error",
        "Access denied. Admin accounts only."
    );

    return res.redirect("/viewTrips");

}

// ======================
// Corporate Role Middleware
// ======================
function checkCorporate(req, res, next) {

    if (req.session.user.role === "corporate") {
        return next();
    }

    req.flash("error", "Access denied. Corporate accounts only.");
    res.redirect("/viewTrips");
}

// ======================
// Home Page
// ======================
app.get("/", (req, res) => {

    res.render("index", {
        user: req.session.user,
        success: req.flash("success"),
        error: req.flash("error")
    });

});

// ======================
// Register Page
// ======================
app.get("/register", (req, res) => {

    res.render("register", {
        user: req.session.user,
        success: req.flash("success"),
        error: req.flash("error")
    });

});

// ======================
// Register User
// ======================
app.post("/register", (req, res) => {

    const {
        username,
        email,
        password,
        role
    } = req.body;

    if (!username || !email || !password || !role) {
        req.flash("error", "All fields are required.");
        return res.redirect("/register");
    }

    const checkEmail = "SELECT * FROM users WHERE email = ?";

    pool.query(checkEmail, [email], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length > 0) {
            req.flash("error", "Email already exists.");
            return res.redirect("/register");
        }

        const sql = `
            INSERT INTO users
            (username, email, password, role)
            VALUES (?, ?, ?, ?)
        `;

        pool.query(
            sql,
            [
                username,
                email,
                password,
                role
            ],
            (err) => {

                if (err) {
                    console.error(err);
                    return res.send("Database Error");
                }

                req.flash(
                    "success",
                    "Registration successful. Please login."
                );

                res.redirect("/login");

            }
        );

    });

});

// ======================
// Login Page
// ======================
app.get("/login", (req, res) => {

    res.render("login", {
        user: req.session.user,
        success: req.flash("success"),
        error: req.flash("error")
    });

});

// ======================
// Login User
// ======================
app.post("/login", (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (!email || !password) {
        req.flash("error", "All fields are required.");
        return res.redirect("/login");
    }

    const sql = `
        SELECT *
        FROM users
        WHERE email = ?
        AND password = ?
    `;

    pool.query(sql, [email, password], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Invalid email or password.");
            return res.redirect("/login");
        }

        req.session.user = results[0];

        req.flash("success", "Welcome back!");

        if (req.session.user.role === "admin") {
            return res.redirect("/admin");
        }

        if (req.session.user.role === "corporate") {
            return res.redirect("/viewTrips");
        }

        return res.redirect("/viewTrips");

    });

});

// ======================
// Logout
// ======================
app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.error(err);
        }

        res.redirect("/");

    });

});

// =========================================================
// ADMIN DASHBOARD
// =========================================================

app.get(
    "/admin",
    checkAuthenticated,
    checkAdmin,
    (req, res) => {

        const usersSql = `

            SELECT
                id,
                username,
                email,
                role

            FROM users

            ORDER BY users.id ASC, trips.id ASC

        `;

        const tripsSql = `

            SELECT

                trips.*,

                users.username,

                users.email

            FROM trips

            JOIN users

                ON trips.user_id = users.id

            ORDER BY trips.id DESC

        `;

        pool.query(
            usersSql,
            (err, users) => {

                if (err) {

                    console.error(err);

                    return res.send(
                        "Database Error"
                    );

                }

                pool.query(
                    tripsSql,
                    (err, trips) => {

                        if (err) {

                            console.error(err);

                            return res.send(
                                "Database Error"
                            );

                        }

                        res.render(
                            "admin",
                            {

                                user:
                                    req.session.user,

                                users,

                                trips,

                                success:
                                    req.flash(
                                        "success"
                                    ),

                                error:
                                    req.flash(
                                        "error"
                                    )
                            }
                        );
                    }
                );
            }
        );
    }
);

// ======================
// ADMIN DELETE USER
// ======================

app.get(

    "/admin/deleteUser/:id",

    checkAuthenticated,

    checkAdmin,

    (req, res) => {

        const userId =
            req.params.id;

        if (
            parseInt(userId) ===
            req.session.user.id
        ) {

            req.flash(

                "error",

                "You cannot delete your own admin account."

            );

            return res.redirect(
                "/admin"
            );

        }

        const sql = `

            DELETE FROM users

            WHERE id = ?

        `;

        pool.query(

            sql,

            [userId],

            (err) => {

                if (err) {

                    console.error(err);

                    return res.send(
                        "Database Error"
                    );

                }

                req.flash(

                    "success",

                    "User deleted successfully."

                );

                res.redirect(
                    "/admin"
                );
            }
        );
    }
);

// ======================
// ADMIN DELETE TRIP
// ======================

app.get(

    "/admin/deleteTrip/:id",

    checkAuthenticated,

    checkAdmin,

    (req, res) => {

        const tripId =
            req.params.id;

        const sql = `

            DELETE FROM trips

            WHERE id = ?

        `;

        pool.query(

            sql,

            [tripId],

            (err) => {

                if (err) {

                    console.error(err);

                    return res.send(
                        "Database Error"
                    );

                }

                req.flash(

                    "success",

                    "Trip deleted successfully."

                );

                res.redirect(
                    "/admin"
                );
            }
        );
    }
);

// ======================
// View Trips Dashboard
// ======================
app.get("/viewTrips", checkAuthenticated, (req, res) => {

    // ==========================
    // CORPORATE USER DASHBOARD
    // ==========================
    if (req.session.user.role === "corporate") {

        const summarySql = `
            SELECT
                COUNT(*) AS totalTrips,
                COALESCE(SUM(budget), 0) AS totalBudget
            FROM group_trips
            WHERE corporate_user_id = ?
        `;

        const groupTripSql = `
            SELECT
                gt.*,
                COUNT(gm.id) AS memberCount
            FROM group_trips gt
            LEFT JOIN group_trip_members gm
                ON gt.id = gm.group_trip_id
            WHERE gt.corporate_user_id = ?
            GROUP BY gt.id
            ORDER BY gt.startDate DESC
        `;

        pool.query(summarySql, [req.session.user.id], (err, summary) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            pool.query(groupTripSql, [req.session.user.id], (err, groupTrips) => {

                if (err) {
                    console.error(err);
                    return res.send("Database Error");
                }

                res.render("viewTrips", {
                    user: req.session.user,

                    groupTrips,
                    trips: [],

                    totalTrips: summary[0].totalTrips,
                    totalBudget: summary[0].totalBudget,

                    search: "",
                    country: "",
                    sort: "",

                    success: req.flash("success"),
                    error: req.flash("error")
                });

            });

        });

        return;
    }

    // ==========================
    // NORMAL USER DASHBOARD
    // ==========================

    const search = req.query.search || "";
    const country = req.query.country || "";
    const sort = req.query.sort || "";

    let sql = `
        SELECT *
        FROM trips
        WHERE user_id = ?
    `;

    let values = [req.session.user.id];

    if (search) {

        sql += `
            AND (
                destination LIKE ?
                OR country LIKE ?
            )
        `;

        values.push(`%${search}%`);
        values.push(`%${search}%`);

    }

    if (country) {

        sql += `
            AND country = ?
        `;

        values.push(country);

    }

    switch (sort) {

        case "budgetAsc":
            sql += " ORDER BY budget ASC";
            break;

        case "budgetDesc":
            sql += " ORDER BY budget DESC";
            break;

        case "dateAsc":
            sql += " ORDER BY startDate ASC";
            break;

        case "dateDesc":
            sql += " ORDER BY startDate DESC";
            break;

        default:
            sql += " ORDER BY id DESC";

    }

    const totalSql = `
        SELECT
            COUNT(*) AS totalTrips,
            COALESCE(SUM(budget),0) AS totalBudget
        FROM trips
        WHERE user_id = ?
    `;

    pool.query(totalSql, [req.session.user.id], (err, summary) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        pool.query(sql, values, (err, trips) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render("viewTrips", {

                user: req.session.user,

                trips,
                groupTrips: [],

                totalTrips: summary[0].totalTrips,
                totalBudget: summary[0].totalBudget,

                search,
                country,
                sort,

                success: req.flash("success"),
                error: req.flash("error")

            });

        });

    });

});

// ======================
// Add Travel Page
// ======================
app.get("/addTravel", checkAuthenticated, (req, res) => {

    res.render("addTravel", {
        user: req.session.user,
        success: req.flash("success"),
        error: req.flash("error")
    });

});

// ======================
// View Single Trip
// ======================
app.get("/trip/:id", checkAuthenticated, (req, res) => {

    const id = req.params.id;

    const sql = `
        SELECT *
        FROM trips
        WHERE id = ?
        AND user_id = ?
    `;

    pool.query(sql, [id, req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Trip not found.");
            return res.redirect("/viewTrips");
        }

        res.render("viewYourTrip", {
            user: req.session.user,
            trip: results[0],
            success: req.flash("success"),
            error: req.flash("error")
        });

    });

});

// ======================
// Save Travel
// ======================
app.post(
    "/addTrip",
    checkAuthenticated,
    upload.single("destinationImage"),
    (req, res) => {

        const {
            destination,
            country,
            startDate,
            endDate,
            budget,
            notes
        } = req.body;

        const imagePath = req.file
            ? req.file.filename
            : null;

        const sql = `
            INSERT INTO trips
            (
                user_id,
                destination,
                country,
                startDate,
                endDate,
                budget,
                notes,
                image
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        pool.query(
            sql,
            [
                req.session.user.id,
                destination,
                country,
                startDate,
                endDate,
                budget,
                notes,
                imagePath
            ],
            (err) => {

                if (err) {
                    console.error(err);
                    return res.send("Database Error");
                }

                req.flash(
                    "success",
                    "Trip added successfully!"
                );

                res.redirect("/viewTrips");

            }
        );

    }
);

// ======================
// Edit Travel Page
// ======================
app.get("/editTrip/:id", checkAuthenticated, (req, res) => {

    const id = req.params.id;

    const sql = `
        SELECT *
        FROM trips
        WHERE id = ?
        AND user_id = ?
    `;

    pool.query(sql, [id, req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Trip not found.");
            return res.redirect("/viewTrips");
        }

        res.render("editTravel", {
            user: req.session.user,
            trip: results[0],
            success: req.flash("success"),
            error: req.flash("error")
        });

    });

});

// ======================
// Update Travel
// ======================
app.post(
    "/editTravel/:id",
    checkAuthenticated,
    upload.single("destinationImage"),
    (req, res) => {

        const id = req.params.id;

        const {
            destination,
            country,
            startDate,
            endDate,
            budget,
            notes
        } = req.body;

        const newImage = req.file ? req.file.filename : null;

        // If user uploads a new image
        if (newImage) {

            const sql = `
                UPDATE trips
                SET destination = ?,
                    country = ?,
                    startDate = ?,
                    endDate = ?,
                    budget = ?,
                    notes = ?,
                    image = ?
                WHERE id = ?
                AND user_id = ?
            `;

            pool.query(
                sql,
                [
                    destination,
                    country,
                    startDate,
                    endDate,
                    budget,
                    notes,
                    newImage,
                    id,
                    req.session.user.id
                ],
                (err) => {

                    if (err) {
                        console.error(err);
                        return res.send("Database Error");
                    }

                    req.flash("success", "Trip updated successfully.");

                    res.redirect("/viewTrips");

                }
            );

        } else {

            // Keep existing image
            const sql = `
                UPDATE trips
                SET destination = ?,
                    country = ?,
                    startDate = ?,
                    endDate = ?,
                    budget = ?,
                    notes = ?
                WHERE id = ?
                AND user_id = ?
            `;

            pool.query(
                sql,
                [
                    destination,
                    country,
                    startDate,
                    endDate,
                    budget,
                    notes,
                    id,
                    req.session.user.id
                ],
                (err) => {

                    if (err) {
                        console.error(err);
                        return res.send("Database Error");
                    }

                    req.flash("success", "Trip updated successfully.");

                    res.redirect("/viewTrips");

                }
            );

        }

    }
);

// ======================
// Delete Travel
// ======================
app.get("/deleteTravel/:id", checkAuthenticated, (req, res) => {

    const id = req.params.id;

    const sql = `
        DELETE FROM trips
        WHERE id = ?
        AND user_id = ?
    `;

    pool.query(sql, [id, req.session.user.id], (err) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        req.flash("success", "Trip deleted successfully.");

        res.redirect("/viewTrips");

    });

});

// =========================================================
// =========================================================
// CORPORATE USER FEATURE - GROUP TRIPS  (Sharique)
//
// A corporate account organises "group trips" (company /
// team travel) and manages the list of members going on
// each one. Everything here is protected by
// checkAuthenticated + checkCorporate, so only corporate
// accounts can reach it.
// =========================================================
// =========================================================

// ----------------------
// View all group trips (READ ALL)
// Shows every group trip owned by this corporate account,
// plus how many members are on each.
// ----------------------
// ----------------------
// View all group trips
// ----------------------
app.get("/groupTrips", checkAuthenticated, checkCorporate, (req, res) => {

    const sql = `
        SELECT *
        FROM group_trips
        WHERE corporate_user_id = ?
        ORDER BY startDate ASC
    `;

    pool.query(sql, [req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        res.render("groupTrips", {
            user: req.session.user,
            trips: results,
            success: req.flash("success"),
            error: req.flash("error")
        });

    });

});

// ----------------------
// Add group trip - show the form (GET)
// ----------------------
app.get("/addGroupTrip", checkAuthenticated, checkCorporate, (req, res) => {

    res.render("addGroupTrip", {
        user: req.session.user,
        success: req.flash("success"),
        error: req.flash("error")
    });

});

// ----------------------
// Add group trip - save it (POST / INSERT)
// ----------------------
app.post("/addGroupTrip", checkAuthenticated, checkCorporate, upload.single("image"), (req, res) => {

    const {
        groupName,
        destination,
        country,
        startDate,
        endDate,
        budget,
        notes
    } = req.body;

    const image = req.file ? req.file.filename : null;

    if (!groupName || !destination || !country || !startDate || !endDate || !budget) {

        req.flash("error", "Please fill in all required fields.");

        return res.redirect("/addGroupTrip");

    }

    const sql = `
        INSERT INTO group_trips
        (corporate_user_id, groupName, destination, country, startDate, endDate, budget, image, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    pool.query(
        sql,
        [
            req.session.user.id,
            groupName,
            destination,
            country,
            startDate,
            endDate,
            budget,
            image,
            notes
        ],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            req.flash("success", "Group trip created successfully!");

            res.redirect("/groupTrip/" + result.insertId);

        }
    );

});

// ----------------------
// View one group trip + its members (READ ONE)
// ----------------------
app.get("/groupTrip/:id", checkAuthenticated, checkCorporate, (req, res) => {

    const tripId = req.params.id;

    const tripSql = `
        SELECT *
        FROM group_trips
        WHERE id = ?
    `;

    const memberSql = `
        SELECT *
        FROM group_trip_members
        WHERE group_trip_id = ?
    `;

    pool.query(tripSql, [tripId], (err, tripResult) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (tripResult.length === 0) {
            return res.send("Trip not found");
        }

        pool.query(memberSql, [tripId], (err, members) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            res.render("groupTrip", {
                user: req.session.user,
                trip: tripResult[0],
                members,
                success: req.flash("success"),
                error: req.flash("error")
            });

        });

    });

});

// ----------------------
// Edit group trip - show pre-filled form (GET)
// ----------------------
app.get("/editGroupTrip/:id", checkAuthenticated, checkCorporate, (req, res) => {

    const id = req.params.id;

    const sql = `
        SELECT *
        FROM group_trips
        WHERE id = ?
        AND corporate_user_id = ?
    `;

    pool.query(sql, [id, req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Group trip not found.");
            return res.redirect("/groupTrips");
        }

        res.render("editGroupTrip", {
            user: req.session.user,
            trip: results[0],
            success: req.flash("success"),
            error: req.flash("error")
        });

    });

});
// ----------------------
// Edit group trip - save changes (POST / UPDATE)
// ----------------------
app.post("/editGroupTrip/:id", checkAuthenticated, checkCorporate, (req, res) => {

    const id = req.params.id;

    const {
        groupName,
        destination,
        country,
        startDate,
        endDate,
        budget,
        notes
    } = req.body;

    const sql = `
        UPDATE group_trips
        SET groupName = ?,
            destination = ?,
            country = ?,
            startDate = ?,
            endDate = ?,
            budget = ?,
            notes = ?
        WHERE id = ?
        AND corporate_user_id = ?
    `;

    pool.query(
        sql,
        [
            groupName,
            destination,
            country,
            startDate,
            endDate,
            budget,
            notes,
            id,
            req.session.user.id
        ],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            req.flash("success", "Group trip updated successfully.");

            res.redirect("/groupTrips");

        }
    );

});

// ----------------------
// Delete group trip (DELETE)
// group_trip_members rows are removed automatically by the
// ON DELETE CASCADE foreign key.
// ----------------------
app.get("/deleteGroupTrip/:id", checkAuthenticated, checkCorporate, (req, res) => {

    const id = req.params.id;

    const sql = `
        DELETE FROM group_trips
        WHERE id = ?
        AND corporate_user_id = ?
    `;

    pool.query(sql, [id, req.session.user.id], (err, result) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        req.flash("success", "Group trip deleted successfully.");

        res.redirect("/groupTrips");

    });

});

// ----------------------
// Add a member to a group trip (INSERT)
// ----------------------
app.post("/groupTrip/:id/addMember", checkAuthenticated, checkCorporate, (req, res) => {

    const groupTripId = req.params.id;

    const {
        memberName,
        memberEmail
    } = req.body;

    if (!memberName || !memberEmail) {

        req.flash("error", "Member name and email are required.");

        return res.redirect("/groupTrip/" + groupTripId);

    }

    // Make sure this group trip really belongs to the logged-in
    // corporate account before adding anyone to it.
    const ownerSql = `
        SELECT *
        FROM group_trips
        WHERE id = ?
        AND corporate_user_id = ?
    `;

    pool.query(ownerSql, [groupTripId, req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Group trip not found.");
            return res.redirect("/groupTrips");
        }

        const sql = `
            INSERT INTO group_trip_members
            (group_trip_id, member_name, member_email)
            VALUES (?, ?, ?)
        `;

        pool.query(sql, [groupTripId, memberName, memberEmail], (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            req.flash("success", "Member added to group trip.");

        res.redirect("/groupTrip/" + groupTripId);

        });

    });

});

// ----------------------
// Remove a member from a group trip (DELETE)
// ----------------------
app.get("/groupTrip/:id/deleteMember/:memberId", checkAuthenticated, checkCorporate, (req, res) => {

    const groupTripId = req.params.id;
    const memberId = req.params.memberId;

    // Confirm ownership of the group trip first
    const ownerSql = `
        SELECT *
        FROM group_trips
        WHERE id = ?
        AND corporate_user_id = ?
    `;

    pool.query(ownerSql, [groupTripId, req.session.user.id], (err, results) => {

        if (err) {
            console.error(err);
            return res.send("Database Error");
        }

        if (results.length === 0) {
            req.flash("error", "Group trip not found.");
            return res.redirect("/groupTrips");
        }

        const sql = `
            DELETE FROM group_trip_members
            WHERE id = ?
            AND group_trip_id = ?
        `;

        pool.query(sql, [memberId, groupTripId], (err, result) => {

            if (err) {
                console.error(err);
                return res.send("Database Error");
            }

            req.flash("success", "Member removed from group trip.");

            res.redirect("/groupTrip/" + groupTripId);

        });

    });

});

// ======================
// Start Server
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    
    console.log(`Server running on port ${PORT}`);
    
});

// LOAD CONCERNS

async function loadConcerns() {
    try {
        const response = await fetch("/api/concerns");

        if (!response.ok) {
            throw new Error("Failed to load concerns.");
        }

        const concerns = await response.json();

        console.log("Concerns received:", concerns);

        displaySummary(concerns);
        displayConcerns(concerns);

    } catch (error) {
        console.error("Error loading concerns:", error);

        const tableBody =
            document.getElementById("concernsTableBody");

        tableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    Unable to load concerns.
                </td>
            </tr>
        `;
    }
}

// ========================================
// DISPLAY SUMMARY CARDS

function displaySummary(concerns) {
    const total =
        concerns.length;

    const newCount =
        concerns.filter(
            concern => concern.status === "NEW"
        ).length;

    const inProgressCount =
        concerns.filter(
            concern => concern.status === "IN PROGRESS"
        ).length;

    const resolvedCount =
        concerns.filter(
            concern => concern.status === "RESOLVED"
        ).length;

    document.getElementById("totalConcerns").textContent =
        total;
    document.getElementById("newConcerns").textContent =
        newCount;
    document.getElementById("inProgressConcerns").textContent =
        inProgressCount;
    document.getElementById("resolvedConcerns").textContent =
        resolvedCount;
}

// ========================================
// DISPLAY CONCERNS IN TABLE

function displayConcerns(concerns) {
    const tableBody =
        document.getElementById("concernsTableBody");

    // No concerns

    if (concerns.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    No concerns available.
                </td>
            </tr>
        `;

        return;
    }

    // Create table rows

    tableBody.innerHTML = concerns.map(concern => {

        const statusClass =
            getStatusClass(concern.status);

        return `
            <tr>

                <td>
                    ${escapeHTML(concern.reference_number)}
                </td>

                <td>
                    ${escapeHTML(concern.citizen_name)}
                </td>

                <td>
                    ${escapeHTML(concern.concern)}
                </td>

                <td>
                    ${formatDate(concern.created_at)}
                </td>

                <td>
                    <span class="${statusClass}">
                        ${escapeHTML(concern.status)}
                    </span>
                </td>

                <td>
                    <button
                        class="view-button"
                        onclick="viewConcern(${concern.id})"
                    >
                        View
                    </button>
                </td>

            </tr>
        `;

    }).join("");
}

// ========================================
// STATUS CSS CLASS

function getStatusClass(status) {

    if (status === "NEW") {
        return "status-new";
    }

    if (status === "IN PROGRESS") {
        return "status-progress";
    }

    if (status === "RESOLVED") {
        return "status-resolved";
    }

    return "";
}

// ========================================
// FORMAT DATE

function formatDate(dateString) {

    if (!dateString) {
        return "-";
    }

    const date =
        new Date(dateString.replace(" ", "T") + "Z");

    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

// ========================================
// VIEW INDIVIDUAL CONCERN

async function viewConcern(id) {

    try {

        const response =
            await fetch("/api/concerns");

        if (!response.ok) {
            throw new Error("Failed to load concerns.");
        }

        const concerns =
            await response.json();

        const concern =
            concerns.find(item => item.id === id);

        if (!concern) {

            alert("Concern could not be found.");

            return;
        }

        // Show details section

        document.getElementById("concernDetails").style.display =
            "block";

        // Fill in details

        document.getElementById("detailReference").textContent =
            concern.reference_number;
        document.getElementById("detailName").textContent =
            concern.citizen_name;
        document.getElementById("detailPhone").textContent =
            concern.phone_number;
        document.getElementById("detailDate").textContent =
            formatDate(concern.created_at);
        document.getElementById("detailConcern").textContent =
            concern.concern;
        document.getElementById("detailStatus").value =
            concern.status;
        document.getElementById("officialResponse").value =
            concern.official_response || "";

        // Store ID on save button

        document.getElementById("saveConcern").dataset.id =
            concern.id;

        // Scroll to details

        document.getElementById("concernDetails")
            .scrollIntoView({
                behavior: "smooth"
            });

    } catch (error) {

        console.error("Error viewing concern:", error);

        alert("Unable to load the concern.");
    }
}

// ========================================
// CLOSE DETAILS

document
    .getElementById("closeDetails")
    .addEventListener("click", () => {

        document.getElementById("concernDetails").style.display =
            "none";

    });

// ========================================
// REFRESH CURRENT CONCERN DETAILS

async function refreshConcernDetails(id) {
    try {
        const response =
            await fetch("/api/concerns");

        if (!response.ok) {
            throw new Error("Failed to reload concern.");
        }

        const concerns =
            await response.json();

        const concern =
            concerns.find(item => item.id === Number(id));

        if (!concern) {
            return;
        }

        document.getElementById("detailReference").textContent =
            concern.reference_number;
        document.getElementById("detailName").textContent =
            concern.citizen_name;
        document.getElementById("detailPhone").textContent =
            concern.phone_number;
        document.getElementById("detailDate").textContent =
            formatDate(concern.created_at);
        document.getElementById("detailConcern").textContent =
            concern.concern;
        document.getElementById("detailStatus").value =
            concern.status;
        document.getElementById("officialResponse").value =
            concern.official_response || "";

    } catch (error) {

        console.error(
            "Error refreshing concern details:",
            error
        );
    }
}

// ========================================
// SAVE CONCERN CHANGES

document
    .getElementById("saveConcern")
    .addEventListener("click", async () => {

        const button =
            document.getElementById("saveConcern");

        const concernId =
            button.dataset.id;

        const status =
            document.getElementById("detailStatus").value;

        const officialResponse =
            document.getElementById("officialResponse").value;

        if (!concernId) {
            alert("No concern selected.");
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";

        try {

            const response = await fetch(
                `/api/concerns/${concernId}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        status: status,
                        officialResponse: officialResponse
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Failed to update concern."
                );
            }

            // Reload the dashboard data
            await loadConcerns();

            // Reload the selected concern's details
            await refreshConcernDetails(concernId);

            alert("Concern updated successfully.");

        } catch (error) {

            console.error(
                "Error saving concern:",
                error
            );

            alert(
                "Unable to save changes. Please try again."
            );

        } finally {

            button.disabled = false;
            button.textContent = "Save Changes";
        }
    });

// ========================================
// SAVE CONCERN CHANGES

document
    .getElementById("saveConcern")
    .addEventListener("click", async () => {

        const button =
            document.getElementById("saveConcern");

        const concernId =
            button.dataset.id;

        const status =
            document.getElementById("detailStatus").value;

        const officialResponse =
            document.getElementById("officialResponse").value;

        if (!concernId) {
            alert("No concern selected.");
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";

        try {

            const response = await fetch(
                `/api/concerns/${concernId}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        status: status,
                        officialResponse: officialResponse
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Failed to update concern."
                );
            }

            alert("Concern updated successfully.");

            // Reload the concerns table
            await loadConcerns();

        } catch (error) {

            console.error(
                "Error saving concern:",
                error
            );

            alert(
                "Unable to save changes. Please try again."
            );

        } finally {
            button.disabled = false;
            button.textContent = "Save Changes";
        }
    });

// ========================================
// STATUS FILTER

document
    .getElementById("statusFilter")
    .addEventListener("change", async function () {

        const selectedStatus =
            this.value;


        try {

            const response =
                await fetch("/api/concerns");
            const concerns =
                await response.json();

            if (selectedStatus === "ALL") {

                displayConcerns(concerns);

            } else {

                const filteredConcerns =
                    concerns.filter(
                        concern =>
                            concern.status === selectedStatus
                    );

                displayConcerns(filteredConcerns);
            }

        } catch (error) {

            console.error(
                "Error filtering concerns:",
                error
            );

        }

    });

// ========================================
// BASIC HTML ESCAPING

function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========================================
// START

loadConcerns();
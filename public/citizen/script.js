const form = document.getElementById("concernForm");
const result = document.getElementById("result");

form.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name = document.getElementById("name").value;
    const phone = document.getElementById("phone").value;
    const concern = document.getElementById("concern").value;

    result.textContent = "Sending concern...";

    try {

        const response = await fetch("/api/concerns", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name,
                phone,
                concern
            })
        });

        const data = await response.json();

        if (data.success) {

            result.textContent =
                `Concern submitted successfully! Reference: ${data.referenceNumber}`;

            form.reset();

        } else {

            result.textContent =
                "Something went wrong. Please try again.";

        }

    } catch (error) {

        console.error(error);

        result.textContent =
            "Could not connect to the server.";

    }

});
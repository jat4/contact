const SUPABASE_URL = "https://dxmyyymeyypxcjtmelvj.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tp-IbPEmWXuBvZ8md8CY7Q_TCua9njd";

async function callFunction(name, body) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    },
  );

  const data = await response
    .json()
    .catch(() => ({ error: "Unexpected server response" }));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character],
  );
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/^customer reply$/i, "applicant reply");
}

document.querySelectorAll('input[name="mobileNumber"]').forEach((input) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "").slice(0, 10);
  });
});

const contactForm = document.querySelector("#contactForm");

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.querySelector("#submitButton");
    const status = document.querySelector("#formStatus");

    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Submitting...";

    try {
      const formData = new FormData(contactForm);
      const data = await callFunction(
        "submit-contact",
        Object.fromEntries(formData.entries()),
      );

      status.className = "form-status success application-number-success";
      status.innerHTML = `
        <div class="application-number-result">
          <span>Application Number</span>
          <div class="application-number-row">
            <input
              id="applicationNumberResult"
              type="text"
              value="${escapeHtml(data.applicationNumber)}"
              readonly
              aria-label="Application Number"
            >
            <button
              class="button"
              type="button"
              id="copyApplicationNumber"
            >
              Copy
            </button>
          </div>
          <small>Save this 8-digit number to track your application.</small>
        </div>
      `;

      document
        .querySelector("#copyApplicationNumber")
        .addEventListener("click", async () => {
          const copyButton = document.querySelector("#copyApplicationNumber");

          try {
            await navigator.clipboard.writeText(data.applicationNumber);
            copyButton.textContent = "Copied";
            setTimeout(() => {
              copyButton.textContent = "Copy";
            }, 1800);
          } catch {
            const input = document.querySelector("#applicationNumberResult");
            input.focus();
            input.select();
            copyButton.textContent = "Select & Copy";
          }
        });

      contactForm.reset();
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

const trackForm = document.querySelector("#trackForm");

if (trackForm) {
  let currentApplication = null;

  function renderConversation({ application, messages }) {
    currentApplication = application;

    const conversation = document.querySelector("#conversation");
    conversation.classList.remove("hidden");

    conversation.innerHTML = `
      <div class="conversation-head">
        <h2>Application ${escapeHtml(application.applicationNumber)}</h2>
        <div class="meta">
          Status:
          <strong>${escapeHtml(statusLabel(application.status))}</strong>
          · Submitted ${escapeHtml(formatDate(application.createdAt))}
        </div>
      </div>

      <div class="messages">
        ${messages
          .map(
            (message) => `
              <div class="bubble ${escapeHtml(message.sender_type)}">
                <small>
                  ${message.sender_type === "admin" ? "Admin" : "You"}
                  · ${escapeHtml(formatDate(message.created_at))}
                </small>
                ${escapeHtml(message.message).replace(/\\n/g, "<br>")}
              </div>
            `,
          )
          .join("")}
      </div>

      <div class="card reply-card">
        <form id="replyForm">
          <label>
            Reply <span>*</span>
            <textarea
              name="message"
              required
              maxlength="5000"
              placeholder="Write your reply..."
            ></textarea>
          </label>

          <button class="button" type="submit">
            Send Reply
          </button>

          <p class="form-status" id="replyStatus"></p>
        </form>
      </div>
    `;

    document
      .querySelector("#replyForm")
      .addEventListener("submit", sendReply);
  }

  async function loadApplication() {
    const status = document.querySelector("#trackStatus");
    const button = document.querySelector("#trackButton");

    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Loading...";

    try {
      const formData = new FormData(trackForm);
      const data = await callFunction(
        "track-application",
        Object.fromEntries(formData.entries()),
      );

      renderConversation(data);
      status.textContent = "";
    } catch (error) {
      document.querySelector("#conversation").classList.add("hidden");
      status.className = "form-status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function sendReply(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const status = document.querySelector("#replyStatus");
    const button = form.querySelector("button");

    button.disabled = true;
    status.className = "form-status";
    status.textContent = "Sending...";

    try {
      const message = new FormData(form).get("message");

      await callFunction("customer-reply", {
        applicationNumber: currentApplication.applicationNumber,
        mobileNumber: trackForm.elements.mobileNumber.value,
        message,
      });

      form.reset();

      const data = await callFunction("track-application", {
        applicationNumber: currentApplication.applicationNumber,
        mobileNumber: trackForm.elements.mobileNumber.value,
      });

      renderConversation(data);

      document.querySelector("#replyStatus").className =
        "form-status success";
      document.querySelector("#replyStatus").textContent = "Reply sent.";
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  trackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadApplication();
  });
}
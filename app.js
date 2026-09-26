import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const SUPABASE_URL = "https://dxmyyymeyypxcjtmelvj.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tp-IbPEmWXuBv8zmd8CY7Q_TCua9njd";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let realtimeChannel = null;
let conversationPoll = null;
let lastMessageId = null;
let currentApplication = null;

async function callFunction(name, body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ error: "Unexpected server response" }));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function formatDate(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value) {
  return String(value || "").replace(/_/g, " ").replace(/^customer reply$/i, "applicant reply");
}

function scrollMessagesToBottom(smooth = true) {
  const messages = document.querySelector("#conversation .messages");
  if (messages) messages.scrollTo({ top: messages.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

function isNearBottom(element, threshold = 120) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
}

function wireComposer() {
  const form = document.querySelector("#replyForm");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "true";

  const textarea = form.elements.message;
  textarea.addEventListener("input", () => autoGrowTextarea(textarea));
  textarea.addEventListener("focus", () => {
    setTimeout(() => textarea.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
  });
  autoGrowTextarea(textarea);
  form.addEventListener("submit", sendReply);
}

function updateMessages(messages, { initial = false } = {}) {
  const container = document.querySelector("#conversation .messages");
  if (!container) return;

  const wasNearBottom = initial || isNearBottom(container);
  const previousLastId = container.dataset.lastMessageId || "";
  const newestId = messages?.length ? messages[messages.length - 1].id : "";
  const changed = previousLastId !== newestId;

  if (!changed && !initial) return;

  container.innerHTML = (messages || []).map((message) => `
    <div class="bubble ${escapeHtml(message.sender_type)}">
      <small>${message.sender_type === "admin" ? "Admin" : "You"} · ${escapeHtml(formatDate(message.created_at))}</small>
      <div class="message-text">${escapeHtml(message.message).replace(/\\n/g, "<br>")}</div>
    </div>
  `).join("");

  container.dataset.lastMessageId = newestId;

  if (wasNearBottom) {
    requestAnimationFrame(() => scrollMessagesToBottom(!initial));
  } else if (changed && !initial) {
    const button = document.querySelector("#newMessageButton");
    if (button) button.classList.remove("hidden");
  }
}

function renderConversation({ application, messages }, { initial = false } = {}) {
  currentApplication = application;
  const conversation = document.querySelector("#conversation");
  conversation.classList.remove("hidden");

  if (initial || !document.querySelector("#replyForm")) {
    conversation.innerHTML = `
      <div class="conversation-head">
        <div>
          <span class="conversation-eyebrow">APPLICATION</span>
          <h2>${escapeHtml(application.applicationNumber)}</h2>
          <div class="meta" id="conversationMeta"></div>
        </div>
        <span class="live-pill"><i></i> Live</span>
      </div>
      <div class="messages" aria-live="polite"></div>
      <button class="new-message-button hidden" id="newMessageButton" type="button">New message ↓</button>
      <div class="card reply-card">
        <form id="replyForm">
          <label>
            Reply <span>*</span>
            <textarea name="message" required maxlength="5000" rows="1" placeholder="Write your reply..."></textarea>
          </label>
          <div class="composer-actions">
            <span class="composer-hint">Your reply will appear here instantly.</span>
            <button class="button send-button" type="submit"><span>Send</span><span aria-hidden="true">↑</span></button>
          </div>
          <p class="form-status" id="replyStatus" role="status"></p>
        </form>
      </div>
    `;
    wireComposer();
    document.querySelector("#newMessageButton").addEventListener("click", () => {
      const messages = document.querySelector("#conversation .messages");
      if (messages) messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
      document.querySelector("#newMessageButton").classList.add("hidden");
    });
  }

  const meta = document.querySelector("#conversationMeta");
  if (meta) {
    meta.innerHTML = `Status: <strong>${escapeHtml(statusLabel(application.status))}</strong> · Submitted ${escapeHtml(formatDate(application.createdAt))}`;
  }

  updateMessages(messages, { initial });
}

async function subscribeToApplication(applicationId) {
  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`application:${applicationId}`, { config: { private: false } })
    .on("broadcast", { event: "message_created" }, async () => {
      try {
        const data = await callFunction("track-application", {
          applicationNumber: trackForm.elements.applicationNumber.value,
          mobileNumber: trackForm.elements.mobileNumber.value,
        });
        renderConversation(data);
      } catch (error) {
        console.error("Realtime refresh failed:", error);
      }
    })
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Realtime channel unavailable:", error || status);
      }
    });

  if (conversationPoll) clearInterval(conversationPoll);

  conversationPoll = setInterval(async () => {
    try {
      const data = await callFunction("track-application", {
        applicationNumber: trackForm.elements.applicationNumber.value,
        mobileNumber: trackForm.elements.mobileNumber.value,
      });
      const newestMessageId = data.messages?.length ? data.messages[data.messages.length - 1].id : null;
      if (newestMessageId !== lastMessageId) {
        lastMessageId = newestMessageId;
        renderConversation(data);
      }
    } catch (error) {
      console.warn("Automatic conversation update failed:", error);
    }
  }, 2000);
}

async function loadApplication() {
  const status = document.querySelector("#trackStatus");
  const button = document.querySelector("#trackButton");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Loading...";

  try {
    const formData = new FormData(trackForm);
    const data = await callFunction("track-application", Object.fromEntries(formData.entries()));
    renderConversation(data, { initial: true });
    lastMessageId = data.messages?.length ? data.messages[data.messages.length - 1].id : null;
    await subscribeToApplication(data.application.id);
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
  const message = String(new FormData(form).get("message") || "").trim();
  if (!message) return;

  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Sending...";

  try {
    await callFunction("customer-reply", {
      applicationNumber: currentApplication.applicationNumber,
      mobileNumber: trackForm.elements.mobileNumber.value,
      message,
    });

    form.reset();
    autoGrowTextarea(form.elements.message);

    const data = await callFunction("track-application", {
      applicationNumber: currentApplication.applicationNumber,
      mobileNumber: trackForm.elements.mobileNumber.value,
    });

    lastMessageId = data.messages?.length ? data.messages[data.messages.length - 1].id : null;
    renderConversation(data);
    const replyStatus = document.querySelector("#replyStatus");
    replyStatus.className = "form-status success";
    replyStatus.textContent = "Reply sent.";
    setTimeout(() => {
      if (document.querySelector("#replyStatus") === replyStatus) replyStatus.textContent = "";
    }, 1800);
  } catch (error) {
    status.className = "form-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
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
      const data = await callFunction("submit-contact", Object.fromEntries(new FormData(contactForm).entries()));
      status.className = "form-status success";
      status.textContent = "";

      const resultOverlay = document.createElement("div");
      resultOverlay.className = "application-number-overlay";
      resultOverlay.innerHTML = `
        <div class="application-number-result" role="dialog" aria-modal="true" aria-labelledby="applicationNumberTitle">
          <span id="applicationNumberTitle">Application Submitted</span>
          <p>Your Application Number is:</p>
          <div class="application-number-row">
            <input id="applicationNumberResult" type="text" value="${escapeHtml(data.applicationNumber)}" readonly aria-label="Application Number">
            <button class="button" type="button" id="copyApplicationNumber">Copy</button>
          </div>
          <small>Save this 8-digit number to track your application.</small>
        </div>`;
      document.body.appendChild(resultOverlay);

      resultOverlay.querySelector("#copyApplicationNumber").addEventListener("click", async () => {
        const copyButton = resultOverlay.querySelector("#copyApplicationNumber");
        try {
          await navigator.clipboard.writeText(data.applicationNumber);
          copyButton.textContent = "Copied";
          setTimeout(() => copyButton.textContent = "Copy", 1800);
        } catch {
          const input = resultOverlay.querySelector("#applicationNumberResult");
          input.focus(); input.select(); copyButton.textContent = "Select & Copy";
        }
      });

      resultOverlay.addEventListener("click", (event) => {
        if (event.target === resultOverlay) resultOverlay.remove();
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
  trackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadApplication();
  });
}

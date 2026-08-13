(function () {
  "use strict";

  // ==========================================
  // Configuration
  // ==========================================

  const script = document.currentScript;

  const KB_ID = script?.getAttribute("data-kb-id");

  const API_URL =
    "https://ai-knowledge-base-blue.vercel.app/api/public/chat";

  if (!KB_ID) {
    console.error(
      "AI Chatbot: data-kb-id is missing from the script tag."
    );
    return;
  }


  // ==========================================
  // Styles
  // ==========================================

  const style = document.createElement("style");

  style.textContent = `
    .ai-chatbot-button {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      background: #D4AF37;
      color: #0A1628;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      cursor: pointer;
      z-index: 99999;
      box-shadow: 0 8px 25px rgba(212,175,55,0.4);
      transition: transform 0.2s ease;
    }

    .ai-chatbot-button:hover {
      transform: scale(1.08);
    }


    .ai-chatbot-box {
      position: fixed;
      bottom: 100px;
      right: 24px;
      width: 360px;
      height: 480px;
      background: #0A1628;
      border: 1px solid rgba(212,175,55,0.3);
      border-radius: 16px;
      display: none;
      flex-direction: column;
      z-index: 99999;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: Inter, Arial, sans-serif;
    }


    .ai-chatbot-header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(212,175,55,0.2);
    }


    .ai-chatbot-title {
      color: #D4AF37;
      font-weight: 700;
      font-size: 15px;
    }


    .ai-chatbot-close {
      color: #fff;
      cursor: pointer;
      font-size: 1.4rem;
      line-height: 1;
    }


    .ai-chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }


    .ai-chatbot-message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 0.9rem;
      line-height: 1.5;
      word-wrap: break-word;
    }


    .ai-chatbot-user {
      align-self: flex-end;
      background: #D4AF37;
      color: #0A1628;
    }


    .ai-chatbot-ai {
      align-self: flex-start;
      background: #1A2D45;
      color: #fff;
    }


    .ai-chatbot-input-area {
      padding: 12px;
      border-top: 1px solid rgba(212,175,55,0.2);
      display: flex;
      gap: 8px;
    }


    .ai-chatbot-input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 50px;
      border: 1px solid rgba(212,175,55,0.3);
      background: #111F33;
      color: #fff;
      outline: none;
      min-width: 0;
    }


    .ai-chatbot-input::placeholder {
      color: #9ca8b7;
    }


    .ai-chatbot-send {
      background: #D4AF37;
      color: #0A1628;
      border: none;
      border-radius: 50px;
      padding: 0 18px;
      font-weight: 700;
      cursor: pointer;
    }


    .ai-chatbot-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }


    /* Typing Animation */

    .ai-chatbot-typing {
      align-self: flex-start;
      background: #1A2D45;
      padding: 12px 16px;
      border-radius: 14px;
      display: flex;
      gap: 5px;
    }


    .ai-chatbot-typing span {
      width: 7px;
      height: 7px;
      background: #D4AF37;
      border-radius: 50%;
      display: block;
      animation: aiChatTyping 1.4s infinite ease-in-out;
    }


    .ai-chatbot-typing span:nth-child(1) {
      animation-delay: 0s;
    }

    .ai-chatbot-typing span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .ai-chatbot-typing span:nth-child(3) {
      animation-delay: 0.4s;
    }


    @keyframes aiChatTyping {
      0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.4;
      }

      30% {
        transform: translateY(-5px);
        opacity: 1;
      }
    }


    /* Mobile */

    @media (max-width: 480px) {

      .ai-chatbot-box {
        right: 12px;
        bottom: 88px;
        width: calc(100vw - 24px);
        height: 70vh;
        max-height: 520px;
      }

      .ai-chatbot-button {
        right: 18px;
        bottom: 18px;
        width: 56px;
        height: 56px;
      }

    }
  `;

  document.head.appendChild(style);


  // ==========================================
  // Chat Button
  // ==========================================

  const button = document.createElement("div");

  button.className = "ai-chatbot-button";
  button.innerHTML = "💬";

  document.body.appendChild(button);


  // ==========================================
  // Chat Box
  // ==========================================

  const box = document.createElement("div");

  box.className = "ai-chatbot-box";

  box.innerHTML = `
    <div class="ai-chatbot-header">

      <div class="ai-chatbot-title">
        AI Assistant
      </div>

      <div class="ai-chatbot-close">
        &times;
      </div>

    </div>


    <div class="ai-chatbot-messages"></div>


    <div class="ai-chatbot-input-area">

      <input
        class="ai-chatbot-input"
        type="text"
        placeholder="Type your message..."
      />

      <button class="ai-chatbot-send">
        Send
      </button>

    </div>
  `;

  document.body.appendChild(box);


  // ==========================================
  // Elements
  // ==========================================

  const messages =
    box.querySelector(".ai-chatbot-messages");

  const input =
    box.querySelector(".ai-chatbot-input");

  const sendButton =
    box.querySelector(".ai-chatbot-send");

  const closeButton =
    box.querySelector(".ai-chatbot-close");


  // ==========================================
  // Escape HTML
  // ==========================================

  function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
  }


  // ==========================================
  // Format AI Response
  // ==========================================

  function formatAIResponse(text) {

    let html = escapeHtml(text);


    // Bold
    html = html.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );


    // Bullet points
    html = html.replace(
      /^• (.*)$/gm,
      "• $1"
    );


    // Line breaks
    html = html.replace(
      /\n\n/g,
      "<br><br>"
    );


    html = html.replace(
      /\n/g,
      "<br>"
    );


    return html;
  }


  // ==========================================
  // Add Message
  // ==========================================

  function addMessage(text, isUser) {

    const div = document.createElement("div");

    div.className =
      "ai-chatbot-message " +
      (isUser
        ? "ai-chatbot-user"
        : "ai-chatbot-ai");


    if (isUser) {

      div.textContent = text;

    } else {

      div.innerHTML =
        formatAIResponse(text);

    }


    messages.appendChild(div);

    messages.scrollTop =
      messages.scrollHeight;

  }


  // ==========================================
  // Welcome Message
  // ==========================================

  addMessage(
    "Hi! Ask me anything from this knowledge base.",
    false
  );


  // ==========================================
  // Open / Close
  // ==========================================

  button.onclick = function () {

    const isOpen =
      box.style.display === "flex";

    box.style.display =
      isOpen ? "none" : "flex";

    if (!isOpen) {
      setTimeout(() => input.focus(), 100);
    }

  };


  closeButton.onclick = function () {

    box.style.display = "none";

  };


  // ==========================================
  // Typing Indicator
  // ==========================================

  function showTyping() {

    const typing =
      document.createElement("div");

    typing.className =
      "ai-chatbot-typing";

    typing.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;

    messages.appendChild(typing);

    messages.scrollTop =
      messages.scrollHeight;

    return typing;

  }


  // ==========================================
  // Send Message
  // ==========================================

  async function sendMessage() {

    const text =
      input.value.trim();

    if (!text) return;


    // Prevent duplicate requests
    sendButton.disabled = true;
    input.disabled = true;


    // User message
    addMessage(text, true);

    input.value = "";


    // Typing animation
    const typing =
      showTyping();


    try {

      const response =
        await fetch(API_URL, {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            kbId: KB_ID,
            message: text
          })

        });


      const data =
        await response.json();


      typing.remove();


      addMessage(
        data.reply ||
        data.error ||
        "Sorry, I could not generate a response.",
        false
      );


    } catch (error) {

      console.error(
        "AI Chatbot Error:",
        error
      );


      typing.remove();


      addMessage(
        "Connection error. Please try again.",
        false
      );

    }


    sendButton.disabled = false;
    input.disabled = false;

    input.focus();

  }


  // ==========================================
  // Events
  // ==========================================

  sendButton.onclick =
    sendMessage;


  input.addEventListener(
    "keypress",
    function (event) {

      if (event.key === "Enter") {
        sendMessage();
      }

    }
  );

})();
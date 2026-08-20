(function () {
  // Read config from the <script> tag that loaded this file
  const currentScript =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  const KB_ID = currentScript.getAttribute("kb-id");
  const THEME = currentScript.getAttribute("theme") || "dark";

  // API_URL is derived from this script's own origin, so it always
  // points at the right deployment without hardcoding a domain.
  const API_URL = new URL("/api/public/chat", currentScript.src).toString();

  if (!KB_ID) {
    console.error("[AI Chat Widget] Missing required 'kb-id' attribute on the script tag.");
    return;
  }

  // =========================
  // Chat Button
  // =========================
  const btn = document.createElement("div");
  btn.innerHTML = "💬";
  btn.style.cssText = `
    position:fixed;
    bottom:24px;
    right:24px;
    width:60px;
    height:60px;
    background:#D4AF37;
    color:#0A1628;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:1.6rem;
    cursor:pointer;
    z-index:99999;
    box-shadow:0 8px 25px rgba(212,175,55,0.4);
  `;
  document.body.appendChild(btn);

  // =========================
  // Chat Box
  // =========================
  const box = document.createElement("div");
  box.style.cssText = `
    position:fixed;
    bottom:100px;
    right:24px;
    width:360px;
    height:480px;
    background:#0A1628;
    border:1px solid rgba(212,175,55,0.3);
    border-radius:16px;
    display:none;
    flex-direction:column;
    z-index:99999;
    box-shadow:0 20px 50px rgba(0,0,0,0.5);
    overflow:hidden;
    font-family:Inter,sans-serif;
  `;

  box.innerHTML = `
    <div style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(212,175,55,0.2);">
      <strong style="color:#D4AF37;">AI Assistant</strong>
      <span id="closeChat" style="color:#fff;cursor:pointer;font-size:1.4rem;">&times;</span>
    </div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;"></div>
    <div style="padding:12px;border-top:1px solid rgba(212,175,55,0.2);display:flex;gap:8px;">
      <input id="chatInput" placeholder="Type your message..." style="flex:1;padding:10px 14px;border-radius:50px;border:1px solid rgba(212,175,55,0.3);background:#111F33;color:#fff;outline:none;" />
      <button id="sendChat" style="background:#D4AF37;color:#0A1628;border:none;border-radius:50px;padding:0 18px;font-weight:700;cursor:pointer;">Send</button>
    </div>
  `;
  document.body.appendChild(box);

  // =========================
  // Typing Animation CSS
  // =========================
  const style = document.createElement("style");
  style.textContent = `
    .typing-indicator { display:flex; align-items:center; gap:5px; }
    .typing-indicator span {
      width:7px; height:7px; background:#D4AF37; border-radius:50%; display:block;
      animation: typing 1.4s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(1) { animation-delay:0s; }
    .typing-indicator span:nth-child(2) { animation-delay:0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay:0.4s; }
    @keyframes typing {
      0%, 60%, 100% { transform:translateY(0); opacity:0.4; }
      30% { transform:translateY(-5px); opacity:1; }
    }
  `;
  document.head.appendChild(style);

  // =========================
  // Elements
  // =========================
  const messages = box.querySelector("#chatMessages");
  const input = box.querySelector("#chatInput");
  const sendButton = box.querySelector("#sendChat");

  function addMsg(text, isUser) {
    const div = document.createElement("div");
    div.style.cssText = `
      max-width:80%;
      padding:10px 14px;
      border-radius:14px;
      font-size:0.9rem;
      line-height:1.5;
      word-wrap:break-word;
      ${isUser
        ? "align-self:flex-end;background:#D4AF37;color:#0A1628;"
        : "align-self:flex-start;background:#1A2D45;color:#fff;"}
    `;

    if (isUser) {
      div.textContent = text;
    } else {
      const html = text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/^• (.*)$/gm, "• $1")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>");
      div.innerHTML = html;
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  addMsg("Hi! Ask me anything from this knowledge base.", false);

  btn.onclick = () => {
    box.style.display = box.style.display === "flex" ? "none" : "flex";
  };

  box.querySelector("#closeChat").onclick = () => {
    box.style.display = "none";
  };

  async function send() {
    const text = input.value.trim();
    if (!text) return;

    addMsg(text, true);
    input.value = "";

    const loading = document.createElement("div");
    loading.style.cssText = `
      align-self:flex-start;
      background:#1A2D45;
      padding:12px 16px;
      border-radius:14px;
    `;
    loading.innerHTML = `
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId: KB_ID, message: text }),
      });

      const data = await res.json();
      loading.remove();
      addMsg(data.reply || data.error || "No response", false);
    } catch (e) {
      loading.remove();
      addMsg("Connection error. Please try again.", false);
    }
  }

  sendButton.onclick = send;
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") send();
  });
})();
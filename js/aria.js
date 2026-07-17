const DEFAULT_MESSAGE_DURATION = 3200;

export class AriaController {
  constructor({ panel, messageElement }) {
    this.panel = panel;
    this.messageElement = messageElement;
    this.queue = [];
    this.isSpeaking = false;
  }

  say(message, options = {}) {
    if (!message || typeof message !== "string") {
      return Promise.resolve();
    }

    const {
      duration = DEFAULT_MESSAGE_DURATION,
      priority = false
    } = options;

    return new Promise((resolve) => {
      const entry = { message, duration, resolve };

      if (priority) {
        this.queue.unshift(entry);
      } else {
        this.queue.push(entry);
      }

      this.#processQueue();
    });
  }

  clear() {
    this.queue = [];
    this.isSpeaking = false;
  }

  async #processQueue() {
    if (this.isSpeaking || this.queue.length === 0) {
      return;
    }

    this.isSpeaking = true;
    const entry = this.queue.shift();

    this.panel.classList.remove("aria-panel--speaking");
    void this.panel.offsetWidth;
    this.panel.classList.add("aria-panel--speaking");

    await this.#typeMessage(entry.message);
    await this.#wait(entry.duration);

    entry.resolve();
    this.isSpeaking = false;
    this.#processQueue();
  }

  async #typeMessage(message) {
    this.messageElement.textContent = "";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      this.messageElement.textContent = message;
      return;
    }

    for (const character of message) {
      this.messageElement.textContent += character;
      await this.#wait(character === "." ? 120 : 22);
    }
  }

  #wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}

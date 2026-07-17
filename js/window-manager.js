export class WindowManager {
  constructor({ root, eventBus }) {
    this.root = root;
    this.eventBus = eventBus;
    this.windows = new Map();
    this.zIndex = 100;
  }

  open({ id, title, content, width = "min(760px, 92vw)" }) {
    if (!id) throw new Error("Cada ventana necesita un identificador.");
    if (this.windows.has(id)) {
      this.focus(id);
      return this.windows.get(id);
    }

    const windowElement = document.createElement("section");
    windowElement.className = "os-window";
    windowElement.dataset.windowId = id;
    windowElement.style.width = width;
    windowElement.style.zIndex = String(++this.zIndex);
    windowElement.innerHTML = `
      <header class="os-window__header">
        <h2>${this.#escape(title ?? "MÓDULO")}</h2>
        <button type="button" aria-label="Cerrar ventana">×</button>
      </header>
      <div class="os-window__content"></div>
    `;

    const contentRoot = windowElement.querySelector(".os-window__content");
    if (content instanceof Node) contentRoot.append(content);
    else contentRoot.innerHTML = String(content ?? "");

    windowElement.querySelector("button").addEventListener("click", () => this.close(id));
    windowElement.addEventListener("pointerdown", () => this.focus(id));
    this.root.append(windowElement);
    this.windows.set(id, windowElement);
    this.eventBus.emit("window:opened", { id, title });
    return windowElement;
  }

  focus(id) {
    const target = this.windows.get(id);
    if (!target) return;
    target.style.zIndex = String(++this.zIndex);
  }

  close(id) {
    const target = this.windows.get(id);
    if (!target) return;
    target.remove();
    this.windows.delete(id);
    this.eventBus.emit("window:closed", { id });
  }

  closeAll() {
    [...this.windows.keys()].forEach((id) => this.close(id));
  }

  #escape(value) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }
}

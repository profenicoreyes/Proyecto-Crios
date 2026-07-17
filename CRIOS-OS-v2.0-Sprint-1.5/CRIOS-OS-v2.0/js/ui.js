export class UIController {
  constructor(elements) {
    this.elements = elements;
    this.initialOverviewMarkup = elements.workspaceContent.innerHTML;
    this.activeView = "overview";
    this.views = {};
  }

  configure({ views = {} } = {}) {
    this.views = views;
  }

  showDesktop() {
    this.elements.desktop.hidden = false;
    this.elements.desktop.classList.add("desktop--visible");
  }

  hideStartup() {
    this.elements.startupScreen.classList.add("startup-screen--leaving");
    window.setTimeout(() => {
      this.elements.startupScreen.hidden = true;
    }, 620);
  }

  setStartupStatus(status) {
    this.elements.startupStatus.textContent = status;
  }

  setStartButtonState({ disabled, label }) {
    this.elements.startButton.disabled = disabled;

    if (label) {
      const signal = this.elements.startButton.querySelector(".start-button__signal");
      this.elements.startButton.textContent = "";
      this.elements.startButton.append(signal, document.createTextNode(label));
    }
  }

  appendBootLine({ code, message, level = "normal" }) {
    const line = document.createElement("div");
    line.className = `boot-line boot-line--${level}`;

    const codeElement = document.createElement("span");
    codeElement.className = "boot-line__code";
    codeElement.textContent = code;

    const messageElement = document.createElement("span");
    messageElement.textContent = message;

    line.append(codeElement, messageElement);
    this.elements.bootLines.appendChild(line);
    this.elements.bootConsole.scrollTop = this.elements.bootConsole.scrollHeight;
  }

  clearBootConsole() {
    this.elements.bootLines.textContent = "";
  }

  openOperatorModal() {
    this.elements.operatorModal.hidden = false;
    window.setTimeout(() => this.elements.operatorInput.focus(), 50);
  }

  closeOperatorModal() {
    this.elements.operatorModal.hidden = true;
    this.elements.operatorError.textContent = "";
  }

  setOperator(name) {
    this.elements.operatorName.textContent = name.toUpperCase();
  }

  setOperatorError(message) {
    this.elements.operatorError.textContent = message;
  }

  renderView(viewName) {
    const view = this.views[viewName];
    if (!view) return;

    this.activeView = viewName;
    this.elements.workspaceTitle.textContent = view.title;

    this.elements.dockItems.forEach((item) => {
      item.classList.toggle("dock-item--active", item.dataset.app === viewName);
    });

    if (viewName === "overview") {
      this.elements.workspaceContent.innerHTML = this.initialOverviewMarkup;
      return;
    }

    this.elements.workspaceContent.innerHTML = `
      <section class="empty-state">
        <div class="empty-state__icon" aria-hidden="true">${view.code}</div>
        <p class="eyebrow">MÓDULO DEL SISTEMA</p>
        <h3>${view.heading}</h3>
        <p>${view.text}</p>
      </section>
    `;
  }

  toggleSystemMenu(force) {
    const shouldOpen = typeof force === "boolean"
      ? force
      : this.elements.systemMenu.hidden;

    this.elements.systemMenu.hidden = !shouldOpen;
  }

  showLockedScreen() {
    this.elements.lockedScreen.hidden = false;
  }

  hideLockedScreen() {
    this.elements.lockedScreen.hidden = true;
  }

  updateAudioButton(isMuted) {
    this.elements.audioToggle.setAttribute("aria-pressed", String(isMuted));
    this.elements.audioToggle.setAttribute(
      "aria-label",
      isMuted ? "Activar audio" : "Silenciar audio"
    );

    this.elements.audioToggle.querySelectorAll(".audio-wave").forEach((wave) => {
      wave.style.display = isMuted ? "none" : "";
    });
  }

  updateFullscreenButton(isFullscreen) {
    this.elements.fullscreenToggle.setAttribute(
      "aria-label",
      isFullscreen ? "Salir de pantalla completa" : "Activar pantalla completa"
    );
  }
}

export function getUIElements() {
  return {
    startupScreen: document.querySelector("#startup-screen"),
    startupStatus: document.querySelector("#startup-status"),
    startButton: document.querySelector("#start-button"),
    bootConsole: document.querySelector("#boot-console"),
    bootLines: document.querySelector("#boot-lines"),
    desktop: document.querySelector("#desktop"),
    workspaceContent: document.querySelector("#workspace-content"),
    workspaceTitle: document.querySelector("#workspace-title"),
    operatorName: document.querySelector("#operator-name"),
    operatorModal: document.querySelector("#operator-modal"),
    operatorForm: document.querySelector("#operator-form"),
    operatorInput: document.querySelector("#operator-input"),
    operatorError: document.querySelector("#operator-error"),
    modalClose: document.querySelector("#modal-close"),
    ariaPanel: document.querySelector("#aria-panel"),
    ariaMessage: document.querySelector("#aria-message"),
    dockItems: [...document.querySelectorAll(".dock-item")],
    openMissionsButton: document.querySelector("#open-missions-button"),
    audioToggle: document.querySelector("#audio-toggle"),
    fullscreenToggle: document.querySelector("#fullscreen-toggle"),
    systemMenuButton: document.querySelector("#system-menu-button"),
    systemMenu: document.querySelector("#system-menu"),
    restartButton: document.querySelector("#restart-button"),
    lockButton: document.querySelector("#lock-button"),
    lockedScreen: document.querySelector("#locked-screen"),
    unlockButton: document.querySelector("#unlock-button"),
    windowLayer: document.querySelector("#window-layer")
  };
}

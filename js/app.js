import { AriaController } from "./aria.js";
import { UIController, getUIElements } from "./ui.js";
import { CRIOSEngine } from "./engine.js";

const BOOT_SEQUENCE = [
  { code: "[SYS]", message: "Inicializando núcleo CRIOS...", delay: 420 },
  { code: "[MEM]", message: "Verificación de memoria: correcta", delay: 480, level: "success" },
  { code: "[IO ]", message: "Interfaces científicas detectadas", delay: 460 },
  { code: "[NET]", message: "Enlace orbital degradado", delay: 520, level: "warning" },
  { code: "[PWR]", message: "Red auxiliar estable", delay: 430, level: "success" },
  { code: "[SEC]", message: "Autenticación local disponible", delay: 460 },
  { code: "[ARIA]", message: "Núcleo A.R.I.A. cargado", delay: 560, level: "success" },
  { code: "[ENG]", message: "Motor de misiones preparado", delay: 430, level: "success" },
  { code: "[OK ]", message: "Sistema preparado", delay: 520, level: "success" }
];

class AudioManager {
  constructor(audioElements, state) {
    this.audioElements = audioElements;
    this.state = state;
    this.isMuted = Boolean(state.get("audioMuted"));
    this.applyMuteState();
  }

  applyMuteState() {
    Object.values(this.audioElements).forEach((audio) => {
      if (audio) audio.muted = this.isMuted;
    });
  }

  async play(name, { restart = false } = {}) {
    const audio = this.audioElements[name];
    if (!audio || this.isMuted) return;
    try {
      if (restart) audio.currentTime = 0;
      await audio.play();
    } catch {
      // El audio es opcional durante el desarrollo.
    }
  }

  pause(name) {
    this.audioElements[name]?.pause();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.state.set("audioMuted", this.isMuted);
    this.applyMuteState();
    if (!this.isMuted) this.play("ambient");
    return this.isMuted;
  }
}

class CRIOSApplication {
  constructor() {
    this.elements = getUIElements();
    this.ui = new UIController(this.elements);
    this.engine = new CRIOSEngine({
      windowRoot: this.elements.windowLayer,
      initialState: { phase: "idle", operator: "", activeView: "overview", audioMuted: false }
    });
    this.aria = new AriaController({
      panel: this.elements.ariaPanel,
      messageElement: this.elements.ariaMessage
    });
    this.audio = new AudioManager({
      boot: document.querySelector("#audio-boot"),
      ambient: document.querySelector("#audio-ambient"),
      interface: document.querySelector("#audio-interface")
    }, this.engine.state);
  }

  async init() {
    this.ui.setStartupStatus("CARGANDO NÚCLEO");
    try {
      await this.engine.init();
      this.ui.configure({ views: this.engine.systemConfig.views });
      this.#bindEvents();
      this.#bindSystemEvents();
      this.ui.updateAudioButton(this.audio.isMuted);
      this.ui.setStartupStatus("EN ESPERA");

      const operator = this.engine.state.get("operator");
      if (operator) this.ui.setOperator(operator);
    } catch (error) {
      console.error(error);
      this.ui.setStartupStatus("ERROR DE CARGA");
      this.ui.appendBootLine({ code: "[ERR]", message: "No se pudo cargar el núcleo de datos", level: "warning" });
      this.ui.setStartButtonState({ disabled: true, label: "NÚCLEO NO DISPONIBLE" });
    }
  }

  #bindSystemEvents() {
    this.engine.events.on("missions:loaded", ({ count }) => {
      console.info(`[CRIOS] ${count} misiones cargadas.`);
    });

    this.engine.events.on("window:opened", () => this.audio.play("interface", { restart: true }));
  }

  #bindEvents() {
    this.elements.startButton.addEventListener("click", () => this.startBoot());
    this.elements.operatorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.registerOperator();
    });
    this.elements.modalClose.addEventListener("click", () => {
      if (this.engine.state.get("operator")) this.ui.closeOperatorModal();
    });
    this.elements.operatorModal.addEventListener("click", (event) => {
      if (event.target === this.elements.operatorModal && this.engine.state.get("operator")) this.ui.closeOperatorModal();
    });
    this.elements.dockItems.forEach((item) => {
      item.addEventListener("click", () => {
        this.audio.play("interface", { restart: true });
        this.openView(item.dataset.app);
      });
    });
    this.elements.workspaceContent.addEventListener("click", (event) => {
      if (event.target.closest("#open-missions-button")) this.openView("missions");
    });
    this.elements.audioToggle.addEventListener("click", () => {
      const isMuted = this.audio.toggleMute();
      this.ui.updateAudioButton(isMuted);
      this.aria.say(isMuted ? "Audio desactivado." : "Audio activado.", { duration: 1200, priority: true });
    });
    this.elements.fullscreenToggle.addEventListener("click", () => this.toggleFullscreen());
    this.elements.systemMenuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.ui.toggleSystemMenu();
    });
    document.addEventListener("click", (event) => {
      if (!this.elements.systemMenu.contains(event.target)) this.ui.toggleSystemMenu(false);
    });
    this.elements.restartButton.addEventListener("click", () => window.location.reload());
    this.elements.lockButton.addEventListener("click", () => {
      this.ui.toggleSystemMenu(false);
      this.ui.showLockedScreen();
      this.aria.say("Terminal bloqueada.", { duration: 1500, priority: true });
    });
    this.elements.unlockButton.addEventListener("click", () => {
      this.ui.hideLockedScreen();
      this.aria.say("Acceso restablecido.", { duration: 1500, priority: true });
    });
    document.addEventListener("fullscreenchange", () => this.ui.updateFullscreenButton(Boolean(document.fullscreenElement)));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.ui.toggleSystemMenu(false);
    });
  }

  async startBoot() {
    if (this.engine.state.get("phase") !== "idle") return;
    this.engine.state.set("phase", "booting", { persist: false });
    this.elements.startupScreen.classList.add("startup-screen--booting");
    this.ui.clearBootConsole();
    this.ui.setStartupStatus("INICIANDO");
    this.ui.setStartButtonState({ disabled: true, label: "INICIANDO..." });
    this.audio.play("boot", { restart: true });

    for (const line of BOOT_SEQUENCE) {
      await this.#wait(line.delay);
      this.ui.appendBootLine(line);
    }

    this.ui.setStartupStatus("SISTEMA PREPARADO");
    await this.#wait(480);
    this.ui.showDesktop();
    this.ui.hideStartup();
    this.audio.pause("boot");
    this.audio.play("ambient");
    this.engine.state.set("phase", "desktop", { persist: false });

    const operator = this.engine.state.get("operator");
    if (!operator) {
      await this.aria.say("Operador...", { duration: 900 });
      this.ui.openOperatorModal();
    } else {
      await this.aria.say(`Operador ${this.#firstName(operator)}...`, { duration: 900 });
      this.aria.say("Sistema disponible.", { duration: 1800 });
    }
  }

  registerOperator() {
    const normalized = this.elements.operatorInput.value.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) {
      this.ui.setOperatorError("Identificador no válido.");
      return;
    }

    this.engine.state.set("operator", normalized);
    this.ui.setOperator(normalized);
    this.ui.closeOperatorModal();
    this.audio.play("interface", { restart: true });
    this.engine.events.emit("operator:registered", { operator: normalized });
    this.aria.say(`Operador ${this.#firstName(normalized)}...`, { duration: 900, priority: true });
    this.aria.say("Acceso autorizado.", { duration: 1800 });
  }

  openView(viewName) {
    this.engine.state.set("activeView", viewName);
    this.ui.renderView(viewName);
    const message = this.engine.systemConfig.ariaMessages?.[viewName];
    if (message) this.aria.say(message, { duration: 1300, priority: true });
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      this.aria.say("Pantalla completa no disponible.", { duration: 1800, priority: true });
    }
  }

  #firstName(fullName) {
    return fullName.split(" ")[0];
  }

  #wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}

const app = new CRIOSApplication();
app.init();

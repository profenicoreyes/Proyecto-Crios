import { EventBus } from "./event-bus.js";
import { StateManager } from "./state-manager.js";
import { DataLoader } from "./data-loader.js";
import { MissionManager } from "./mission-manager.js";
import { WindowManager } from "./window-manager.js";

export class CRIOSEngine {
  constructor({ windowRoot, initialState = {} } = {}) {
    this.events = new EventBus();
    this.state = new StateManager({
      storageKey: "crios.state.v2",
      initialState
    });
    this.loader = new DataLoader({ basePath: "./data" });
    this.missions = new MissionManager({ loader: this.loader, eventBus: this.events });
    this.windows = new WindowManager({ root: windowRoot, eventBus: this.events });
    this.systemConfig = null;
  }

  async init() {
    const [systemConfig] = await Promise.all([
      this.loader.json("system.json"),
      this.missions.init()
    ]);

    this.systemConfig = systemConfig;
    this.events.emit("engine:ready", {
      missionCount: this.missions.list().length,
      schemaVersion: systemConfig.schemaVersion
    });

    return this;
  }
}

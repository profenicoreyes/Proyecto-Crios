export class MissionManager {
  constructor({ loader, eventBus }) {
    this.loader = loader;
    this.eventBus = eventBus;
    this.schemaVersion = null;
    this.missions = new Map();
  }

  async init() {
    const payload = await this.loader.json("missions.json");
    this.schemaVersion = payload.schemaVersion ?? "1.0";
    this.missions.clear();

    for (const mission of payload.missions ?? []) {
      if (!mission.id) continue;
      this.missions.set(mission.id, Object.freeze({ ...mission }));
    }

    this.eventBus.emit("missions:loaded", {
      count: this.missions.size,
      schemaVersion: this.schemaVersion
    });
  }

  list() {
    return [...this.missions.values()];
  }

  get(id) {
    return this.missions.get(id) ?? null;
  }
}

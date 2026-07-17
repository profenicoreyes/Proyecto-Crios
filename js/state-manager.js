export class StateManager {
  constructor({ storageKey = "crios.state", initialState = {} } = {}) {
    this.storageKey = storageKey;
    this.state = { ...initialState, ...this.#readStoredState() };
    this.subscribers = new Set();
  }

  get(key) {
    return key ? this.state[key] : structuredClone(this.state);
  }

  set(key, value, { persist = true } = {}) {
    const previous = this.state[key];
    this.state[key] = value;
    if (persist) this.#persist();
    this.#notify({ key, value, previous, state: this.get() });
    return value;
  }

  patch(partialState, { persist = true } = {}) {
    const previous = this.get();
    Object.assign(this.state, partialState);
    if (persist) this.#persist();
    this.#notify({ key: null, value: this.get(), previous, state: this.get() });
  }

  subscribe(handler) {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  reset() {
    localStorage.removeItem(this.storageKey);
  }

  #notify(change) {
    this.subscribers.forEach((handler) => handler(change));
  }

  #readStoredState() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) ?? {};
    } catch {
      return {};
    }
  }

  #persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn("[CRIOS] No fue posible guardar el estado local.", error);
    }
  }
}

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
      throw new TypeError("El manejador del evento debe ser una función.");
    }

    const handlers = this.listeners.get(eventName) ?? new Set();
    handlers.add(handler);
    this.listeners.set(eventName, handlers);

    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off(eventName, handler) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) this.listeners.delete(eventName);
  }

  emit(eventName, payload = {}) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) return;

    [...handlers].forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[CRIOS] Error en evento ${eventName}:`, error);
      }
    });
  }
}

type Listener<T> = (payload: T) => void;

type EventMap = {
  "invoice:downloaded": { numero: string };
  "invoice:sent": { numero: string; reference?: string };
  "invoice:deleted": { numeros: Array<string | number> };
  "invoice:refunded": { numero: string };
};

class EventBus {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn as Listener<unknown>);
    this.listeners.set(event, set);
    return () => set.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<EventMap[K]>)(payload);
    }
  }
}

export const events = new EventBus();

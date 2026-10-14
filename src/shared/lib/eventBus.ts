/** Tiny typed pub/sub used to decouple game logic from toasts and sounds. */
export type Listener<E> = (event: E) => void;

export class EventBus<E> {
  private listeners = new Set<Listener<E>>();

  subscribe(listener: Listener<E>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: E): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('EventBus listener failed', error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

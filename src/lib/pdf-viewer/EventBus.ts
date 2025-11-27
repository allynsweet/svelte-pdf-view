/**
 * Simple event bus for PDF viewer component communication.
 * Based on PDF.js event_utils.js
 */
export class EventBus {
	private listeners: Map<string, Set<EventListener>> = new Map();

	on(eventName: string, listener: EventListener): void {
		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		this.listeners.get(eventName)!.add(listener);
	}

	off(eventName: string, listener: EventListener): void {
		this.listeners.get(eventName)?.delete(listener);
	}

	dispatch(eventName: string, data?: Record<string, unknown>): void {
		const eventListeners = this.listeners.get(eventName);
		if (!eventListeners || eventListeners.size === 0) {
			return;
		}
		for (const listener of eventListeners) {
			listener({ source: this, ...data });
		}
	}

	destroy(): void {
		this.listeners.clear();
	}
}

export type EventListener = (data: Record<string, unknown>) => void;

/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * PdfPresentationMode - Fullscreen presentation mode for PDF viewing.
 * This is a derivative work based on PDF.js pdf_presentation_mode.js
 *
 * Features:
 * - Browser fullscreen mode
 * - Black background
 * - Single page view scaled to fit screen
 * - No text layer or toolbar
 * - Mouse/keyboard/touch navigation
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export enum PresentationModeState {
	UNKNOWN = 0,
	NORMAL = 1,
	CHANGING = 2,
	FULLSCREEN = 3
}

const MOUSE_SCROLL_COOLDOWN_TIME = 50; // in ms
const PAGE_SWITCH_THRESHOLD = 0.1;
const SWIPE_MIN_DISTANCE_THRESHOLD = 50;
const SWIPE_ANGLE_THRESHOLD = Math.PI / 6;

export interface PresentationModeCallbacks {
	onStateChange?: (state: PresentationModeState) => void;
	onPageChange?: (pageNumber: number) => void;
}

export class PdfPresentationMode {
	private state: PresentationModeState = PresentationModeState.UNKNOWN;
	private pdfDocument: PDFDocumentProxy | null = null;
	private currentPageNumber = 1;
	private totalPages = 0;

	private container: HTMLDivElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private callbacks: PresentationModeCallbacks;

	private fullscreenChangeAbortController: AbortController | null = null;
	private windowAbortController: AbortController | null = null;

	private mouseScrollTimeStamp = 0;
	private mouseScrollDelta = 0;
	private touchSwipeState: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null = null;

	private renderingPage = false;

	constructor(callbacks: PresentationModeCallbacks = {}) {
		this.callbacks = callbacks;
	}

	/**
	 * Set the PDF document for presentation
	 */
	setDocument(pdfDocument: PDFDocumentProxy | null): void {
		this.pdfDocument = pdfDocument;
		this.totalPages = pdfDocument?.numPages ?? 0;
	}

	/**
	 * Set the current page number (used when entering presentation mode)
	 */
	setCurrentPage(pageNumber: number): void {
		this.currentPageNumber = Math.max(1, Math.min(pageNumber, this.totalPages));
	}

	/**
	 * Check if presentation mode is active
	 */
	get active(): boolean {
		return (
			this.state === PresentationModeState.CHANGING ||
			this.state === PresentationModeState.FULLSCREEN
		);
	}

	/**
	 * Get current state
	 */
	get currentState(): PresentationModeState {
		return this.state;
	}

	/**
	 * Request entering fullscreen presentation mode
	 */
	async request(): Promise<boolean> {
		if (this.active || !this.pdfDocument || this.totalPages === 0) {
			return false;
		}

		// Create the presentation container
		this.createPresentationContainer();

		if (!this.container) {
			return false;
		}

		this.addFullscreenChangeListeners();
		this.notifyStateChange(PresentationModeState.CHANGING);

		try {
			await this.container.requestFullscreen();
			return true;
		} catch {
			this.removeFullscreenChangeListeners();
			this.notifyStateChange(PresentationModeState.NORMAL);
			this.destroyPresentationContainer();
			return false;
		}
	}

	/**
	 * Exit presentation mode
	 */
	async exit(): Promise<void> {
		if (!this.active) {
			return;
		}

		if (document.fullscreenElement) {
			await document.exitFullscreen();
		}
	}

	/**
	 * Go to next page
	 */
	nextPage(): boolean {
		if (this.currentPageNumber >= this.totalPages) {
			return false;
		}
		this.currentPageNumber++;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	/**
	 * Go to previous page
	 */
	previousPage(): boolean {
		if (this.currentPageNumber <= 1) {
			return false;
		}
		this.currentPageNumber--;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	/**
	 * Go to a specific page
	 */
	goToPage(pageNumber: number): boolean {
		if (pageNumber < 1 || pageNumber > this.totalPages) {
			return false;
		}
		this.currentPageNumber = pageNumber;
		this.renderCurrentPage();
		this.callbacks.onPageChange?.(this.currentPageNumber);
		return true;
	}

	/**
	 * Destroy and cleanup
	 */
	destroy(): void {
		this.exit();
		this.removeWindowListeners();
		this.removeFullscreenChangeListeners();
		this.destroyPresentationContainer();
	}

	// Private methods

	private createPresentationContainer(): void {
		// Create fullscreen container
		this.container = document.createElement('div');
		this.container.className = 'pdf-presentation-mode';
		this.container.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: #000;
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 999999;
		`;

		// Create canvas for rendering
		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText = `
			max-width: 100%;
			max-height: 100%;
			object-fit: contain;
		`;

		this.container.appendChild(this.canvas);
		document.body.appendChild(this.container);
	}

	private destroyPresentationContainer(): void {
		if (this.container) {
			this.container.remove();
			this.container = null;
			this.canvas = null;
		}
	}

	private async renderCurrentPage(): Promise<void> {
		if (!this.pdfDocument || !this.canvas || !this.container || this.renderingPage) {
			return;
		}

		this.renderingPage = true;

		try {
			const page = await this.pdfDocument.getPage(this.currentPageNumber);

			// Calculate scale to fit the screen while maintaining aspect ratio
			const containerWidth = window.innerWidth;
			const containerHeight = window.innerHeight;

			const viewport = page.getViewport({ scale: 1, rotation: 0 });
			const pageWidth = viewport.width;
			const pageHeight = viewport.height;

			// Calculate scale to fit
			const scaleX = containerWidth / pageWidth;
			const scaleY = containerHeight / pageHeight;
			const scale = Math.min(scaleX, scaleY);

			const scaledViewport = page.getViewport({ scale, rotation: 0 });

			// Set canvas size
			this.canvas.width = scaledViewport.width;
			this.canvas.height = scaledViewport.height;

			const context = this.canvas.getContext('2d');
			if (!context) {
				return;
			}

			// Clear and render
			context.fillStyle = '#fff';
			context.fillRect(0, 0, this.canvas.width, this.canvas.height);

			await page.render({
				canvasContext: context,
				viewport: scaledViewport,
				canvas: this.canvas
			}).promise;
		} catch (e) {
			console.error('Failed to render presentation page:', e);
		} finally {
			this.renderingPage = false;
		}
	}

	private notifyStateChange(newState: PresentationModeState): void {
		this.state = newState;
		this.callbacks.onStateChange?.(newState);
	}

	private enter(): void {
		this.notifyStateChange(PresentationModeState.FULLSCREEN);
		this.addWindowListeners();
		this.renderCurrentPage();

		// Clear any text selection
		document.getSelection()?.empty();
	}

	private doExit(): void {
		this.removeWindowListeners();
		this.destroyPresentationContainer();
		this.resetMouseScrollState();

		this.removeFullscreenChangeListeners();
		this.notifyStateChange(PresentationModeState.NORMAL);
	}

	private handleMouseWheel = (evt: WheelEvent): void => {
		if (!this.active) {
			return;
		}
		evt.preventDefault();

		const delta = this.normalizeWheelDelta(evt);
		const currentTime = Date.now();
		const storedTime = this.mouseScrollTimeStamp;

		// Cooldown to prevent accidental double-switching
		if (currentTime > storedTime && currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
			return;
		}

		// Reset if direction changed
		if ((this.mouseScrollDelta > 0 && delta < 0) || (this.mouseScrollDelta < 0 && delta > 0)) {
			this.resetMouseScrollState();
		}

		this.mouseScrollDelta += delta;

		if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
			const totalDelta = this.mouseScrollDelta;
			this.resetMouseScrollState();
			const success = totalDelta > 0 ? this.previousPage() : this.nextPage();
			if (success) {
				this.mouseScrollTimeStamp = currentTime;
			}
		}
	};

	private normalizeWheelDelta(evt: WheelEvent): number {
		let delta = Math.hypot(evt.deltaX, evt.deltaY);
		const angle = Math.atan2(evt.deltaY, evt.deltaX);

		if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
			delta = -delta;
		}

		if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			delta *= 30;
		} else if (evt.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			delta *= 30 * 10;
		}

		return delta / 30;
	}

	private handleMouseDown = (evt: MouseEvent): void => {
		// Left click (0) = next page, Right click (2) = previous page
		if (evt.button === 0) {
			evt.preventDefault();
			if (evt.shiftKey) {
				this.previousPage();
			} else {
				this.nextPage();
			}
		} else if (evt.button === 2) {
			evt.preventDefault();
			this.previousPage();
		}
	};

	private handleKeyDown = (evt: KeyboardEvent): void => {
		if (!this.active) {
			return;
		}

		this.resetMouseScrollState();

		switch (evt.key) {
			case 'ArrowRight':
			case 'ArrowDown':
			case ' ':
			case 'PageDown':
			case 'Enter':
				evt.preventDefault();
				this.nextPage();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
			case 'PageUp':
			case 'Backspace':
				evt.preventDefault();
				this.previousPage();
				break;
			case 'Home':
				evt.preventDefault();
				this.goToPage(1);
				break;
			case 'End':
				evt.preventDefault();
				this.goToPage(this.totalPages);
				break;
			case 'Escape':
				// Escape is handled by the browser for fullscreen exit
				break;
		}
	};

	private handleContextMenu = (evt: MouseEvent): void => {
		// Prevent context menu - right-click is handled in handleMouseDown
		evt.preventDefault();
	};

	private handleTouchSwipe = (evt: TouchEvent): void => {
		if (!this.active) {
			return;
		}

		if (evt.touches.length > 1) {
			this.touchSwipeState = null;
			return;
		}

		switch (evt.type) {
			case 'touchstart':
				this.touchSwipeState = {
					startX: evt.touches[0].pageX,
					startY: evt.touches[0].pageY,
					endX: evt.touches[0].pageX,
					endY: evt.touches[0].pageY
				};
				break;
			case 'touchmove':
				if (this.touchSwipeState === null) {
					return;
				}
				this.touchSwipeState.endX = evt.touches[0].pageX;
				this.touchSwipeState.endY = evt.touches[0].pageY;
				evt.preventDefault();
				break;
			case 'touchend': {
				if (this.touchSwipeState === null) {
					return;
				}
				const dx = this.touchSwipeState.endX - this.touchSwipeState.startX;
				const dy = this.touchSwipeState.endY - this.touchSwipeState.startY;
				const absAngle = Math.abs(Math.atan2(dy, dx));

				let delta = 0;
				if (
					Math.abs(dx) > SWIPE_MIN_DISTANCE_THRESHOLD &&
					(absAngle <= SWIPE_ANGLE_THRESHOLD || absAngle >= Math.PI - SWIPE_ANGLE_THRESHOLD)
				) {
					// Horizontal swipe
					delta = dx;
				} else if (
					Math.abs(dy) > SWIPE_MIN_DISTANCE_THRESHOLD &&
					Math.abs(absAngle - Math.PI / 2) <= SWIPE_ANGLE_THRESHOLD
				) {
					// Vertical swipe
					delta = dy;
				}

				if (delta > 0) {
					this.previousPage();
				} else if (delta < 0) {
					this.nextPage();
				}

				this.touchSwipeState = null;
				break;
			}
		}
	};

	private handleResize = (): void => {
		if (this.active) {
			this.renderCurrentPage();
		}
	};

	private resetMouseScrollState(): void {
		this.mouseScrollTimeStamp = 0;
		this.mouseScrollDelta = 0;
	}

	private addWindowListeners(): void {
		if (this.windowAbortController) {
			return;
		}

		this.windowAbortController = new AbortController();
		const { signal } = this.windowAbortController;

		window.addEventListener('mousedown', this.handleMouseDown, { signal });
		window.addEventListener('wheel', this.handleMouseWheel, { passive: false, signal });
		window.addEventListener('keydown', this.handleKeyDown, { signal });
		window.addEventListener('contextmenu', this.handleContextMenu, { signal });
		window.addEventListener('touchstart', this.handleTouchSwipe, { signal });
		window.addEventListener('touchmove', this.handleTouchSwipe, { passive: false, signal });
		window.addEventListener('touchend', this.handleTouchSwipe, { signal });
		window.addEventListener('resize', this.handleResize, { signal });
	}

	private removeWindowListeners(): void {
		this.windowAbortController?.abort();
		this.windowAbortController = null;
	}

	private addFullscreenChangeListeners(): void {
		if (this.fullscreenChangeAbortController) {
			return;
		}

		this.fullscreenChangeAbortController = new AbortController();

		window.addEventListener(
			'fullscreenchange',
			() => {
				if (document.fullscreenElement) {
					this.enter();
				} else {
					this.doExit();
				}
			},
			{ signal: this.fullscreenChangeAbortController.signal }
		);
	}

	private removeFullscreenChangeListeners(): void {
		this.fullscreenChangeAbortController?.abort();
		this.fullscreenChangeAbortController = null;
	}
}

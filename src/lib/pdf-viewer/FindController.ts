/**
 * FindController - Text search functionality for PDF viewer.
 * Simplified version based on PDF.js pdf_find_controller.js
 */
import type { EventBus } from './EventBus.js';
import type { PDFViewerCore } from './PDFViewerCore.js';

export const FindState = {
	FOUND: 0,
	NOT_FOUND: 1,
	WRAPPED: 2,
	PENDING: 3
} as const;

export interface FindOptions {
	query: string;
	highlightAll?: boolean;
	caseSensitive?: boolean;
	entireWord?: boolean;
	findPrevious?: boolean;
}

interface PageMatch {
	pageIndex: number;
	matchIndex: number;
	divIndex: number;
	offset: number;
	length: number;
}

export class FindController {
	private viewer: PDFViewerCore;
	private eventBus: EventBus;

	private query: string = '';
	private caseSensitive: boolean = false;
	private entireWord: boolean = false;
	private highlightAll: boolean = true;

	private pageMatches: number[][] = [];
	private pageMatchesLength: number[][] = [];
	private allMatches: PageMatch[] = [];
	private selectedMatchIndex: number = -1;

	private highlightedElements: HTMLElement[] = [];

	constructor(viewer: PDFViewerCore, eventBus: EventBus) {
		this.viewer = viewer;
		this.eventBus = eventBus;
	}

	async find(options: FindOptions): Promise<void> {
		const {
			query,
			highlightAll = true,
			caseSensitive = false,
			entireWord = false,
			findPrevious = false
		} = options;

		// Clear previous highlights
		this.clearHighlights();

		if (!query || query.trim() === '') {
			this.query = '';
			this.allMatches = [];
			this.selectedMatchIndex = -1;
			this.eventBus.dispatch('updatefindmatchescount', {
				matchesCount: { current: 0, total: 0 }
			});
			return;
		}

		this.query = query;
		this.highlightAll = highlightAll;
		this.caseSensitive = caseSensitive;
		this.entireWord = entireWord;

		this.eventBus.dispatch('updatefindcontrolstate', {
			state: FindState.PENDING
		});

		// Search all pages
		this.allMatches = [];
		this.pageMatches = [];
		this.pageMatchesLength = [];

		for (let i = 0; i < this.viewer.pagesCount; i++) {
			const pageView = this.viewer.getPageView(i);
			if (!pageView) continue;

			const pageMatches: number[] = [];
			const pageMatchesLength: number[] = [];

			const textItems = pageView.textContentItemsStr;
			const fullText = textItems.join('');

			const searchText = caseSensitive ? fullText : fullText.toLowerCase();
			const searchQuery = caseSensitive ? query : query.toLowerCase();

			let pos = 0;
			while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
				// Check entire word if required
				if (entireWord) {
					const before = pos > 0 ? searchText[pos - 1] : ' ';
					const after =
						pos + searchQuery.length < searchText.length
							? searchText[pos + searchQuery.length]
							: ' ';
					if (/\w/.test(before) || /\w/.test(after)) {
						pos++;
						continue;
					}
				}

				pageMatches.push(pos);
				pageMatchesLength.push(searchQuery.length);

				// Find which div this match belongs to
				let charIndex = 0;
				let divIndex = 0;
				for (let j = 0; j < textItems.length; j++) {
					if (charIndex + textItems[j].length > pos) {
						divIndex = j;
						break;
					}
					charIndex += textItems[j].length;
				}

				this.allMatches.push({
					pageIndex: i,
					matchIndex: pageMatches.length - 1,
					divIndex,
					offset: pos - charIndex,
					length: searchQuery.length
				});

				pos++;
			}

			this.pageMatches.push(pageMatches);
			this.pageMatchesLength.push(pageMatchesLength);
		}

		// Select first or last match based on direction
		if (this.allMatches.length > 0) {
			this.selectedMatchIndex = findPrevious ? this.allMatches.length - 1 : 0;
			this.highlightMatches();
			this.scrollToSelectedMatch();

			this.eventBus.dispatch('updatefindcontrolstate', {
				state: FindState.FOUND
			});
		} else {
			this.selectedMatchIndex = -1;
			this.eventBus.dispatch('updatefindcontrolstate', {
				state: FindState.NOT_FOUND
			});
		}

		this.eventBus.dispatch('updatefindmatchescount', {
			matchesCount: {
				current: this.selectedMatchIndex + 1,
				total: this.allMatches.length
			}
		});
	}

	findNext(): void {
		if (this.allMatches.length === 0) return;

		this.selectedMatchIndex = (this.selectedMatchIndex + 1) % this.allMatches.length;
		this.highlightMatches();
		this.scrollToSelectedMatch();

		const wrapped = this.selectedMatchIndex === 0;
		this.eventBus.dispatch('updatefindcontrolstate', {
			state: wrapped ? FindState.WRAPPED : FindState.FOUND
		});
		this.eventBus.dispatch('updatefindmatchescount', {
			matchesCount: {
				current: this.selectedMatchIndex + 1,
				total: this.allMatches.length
			}
		});
	}

	findPrevious(): void {
		if (this.allMatches.length === 0) return;

		this.selectedMatchIndex =
			(this.selectedMatchIndex - 1 + this.allMatches.length) % this.allMatches.length;
		this.highlightMatches();
		this.scrollToSelectedMatch();

		const wrapped = this.selectedMatchIndex === this.allMatches.length - 1;
		this.eventBus.dispatch('updatefindcontrolstate', {
			state: wrapped ? FindState.WRAPPED : FindState.FOUND
		});
		this.eventBus.dispatch('updatefindmatchescount', {
			matchesCount: {
				current: this.selectedMatchIndex + 1,
				total: this.allMatches.length
			}
		});
	}

	private highlightMatches(): void {
		this.clearHighlights();

		if (!this.highlightAll && this.selectedMatchIndex === -1) return;

		for (let i = 0; i < this.allMatches.length; i++) {
			const match = this.allMatches[i];
			const pageView = this.viewer.getPageView(match.pageIndex);
			if (!pageView) continue;

			const textDiv = pageView.textDivs[match.divIndex];
			if (!textDiv) continue;

			const isSelected = i === this.selectedMatchIndex;

			// Only highlight all if highlightAll is true, otherwise only selected
			if (!this.highlightAll && !isSelected) continue;

			// Create highlight span
			const originalText = textDiv.textContent || '';
			const before = originalText.substring(0, match.offset);
			const highlighted = originalText.substring(match.offset, match.offset + match.length);
			const after = originalText.substring(match.offset + match.length);

			// Clear and rebuild content
			textDiv.textContent = '';

			if (before) {
				textDiv.appendChild(document.createTextNode(before));
			}

			const highlightSpan = document.createElement('span');
			highlightSpan.className = isSelected ? 'highlight selected' : 'highlight';
			highlightSpan.textContent = highlighted;
			textDiv.appendChild(highlightSpan);
			this.highlightedElements.push(highlightSpan);

			if (after) {
				textDiv.appendChild(document.createTextNode(after));
			}
		}
	}

	private scrollToSelectedMatch(): void {
		if (this.selectedMatchIndex === -1) return;

		const match = this.allMatches[this.selectedMatchIndex];
		if (!match) return;

		// First scroll to the page
		this.viewer.scrollToPage(match.pageIndex + 1);

		// Then scroll to the highlighted element
		setTimeout(() => {
			const selectedElement = this.viewer.container.querySelector('.highlight.selected');
			if (selectedElement) {
				selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 100);
	}

	private clearHighlights(): void {
		// Restore original text content
		for (const el of this.highlightedElements) {
			const parent = el.parentElement;
			if (parent) {
				const text = parent.textContent || '';
				parent.textContent = text;
			}
		}
		this.highlightedElements = [];
	}

	get matchesCount(): { current: number; total: number } {
		return {
			current: this.selectedMatchIndex + 1,
			total: this.allMatches.length
		};
	}

	reset(): void {
		this.clearHighlights();
		this.query = '';
		this.allMatches = [];
		this.pageMatches = [];
		this.pageMatchesLength = [];
		this.selectedMatchIndex = -1;
	}
}

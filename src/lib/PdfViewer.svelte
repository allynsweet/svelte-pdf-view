<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { mount, unmount } from 'svelte';
	import pdfViewerStyles from './pdf-viewer/styles.css?raw';

	interface Props {
		/** URL or path to the PDF file */
		src: string;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** CSS class for the container */
		class?: string;
	}

	let { src, scale: initialScale = 1.0, class: className = '' }: Props = $props();

	let hostEl: HTMLDivElement | undefined = $state();
	let shadowRoot: ShadowRoot | null = null;
	let innerComponent: Record<string, unknown> | null = null;

	onMount(async () => {
		if (browser && hostEl) {
			// Create shadow root
			shadowRoot = hostEl.attachShadow({ mode: 'open' });

			// Inject styles into shadow DOM
			const styleEl = document.createElement('style');
			styleEl.textContent = pdfViewerStyles;
			shadowRoot.appendChild(styleEl);

			// Dynamically import and mount the inner component
			const module = await import('./PdfViewerInner.svelte');
			if (shadowRoot) {
				innerComponent = mount(module.default, {
					target: shadowRoot,
					props: {
						src,
						scale: initialScale,
						class: className
					}
				});
			}
		}
	});

	// Update src prop when it changes
	$effect(() => {
		if (innerComponent) {
			// Svelte 5 mount returns a component instance with bound props
			(innerComponent as unknown as { $set: (props: Record<string, unknown>) => void }).$set?.({ src });
		}
	});

	onDestroy(() => {
		if (innerComponent) {
			unmount(innerComponent);
			innerComponent = null;
		}
	});
</script>

<div bind:this={hostEl} class="pdf-viewer-host {className}"></div>

<style>
	.pdf-viewer-host {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>

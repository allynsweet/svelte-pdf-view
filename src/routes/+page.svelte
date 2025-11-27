<script lang="ts">
	import { PdfViewer, PdfToolbar, PdfRenderer } from '$lib/index.js';

	let pdfUrl = $state('/Demo.pdf');
</script>

<div class="demo">
	<h1>PDF Viewer Demo</h1>

	<div class="url-input">
		<label for="pdf-url">PDF URL:</label>
		<input id="pdf-url" type="text" bind:value={pdfUrl} placeholder="Enter PDF URL..." />
	</div>

	<div class="viewer-container">
		<PdfViewer src={pdfUrl}>
			<PdfToolbar />
			<PdfRenderer
				src={pdfUrl}
				backgroundColor="#e8e8e8"
				scrollbarThumbColor="#c1c1c1"
				scrollbarTrackColor="#f1f1f1"
			/>
		</PdfViewer>
		
	</div>
</div>

<style>
	.demo {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 1rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0 0 1rem 0;
	}

	.url-input {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 1rem;
	}

	.url-input input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.viewer-container {
		flex: 1;
		min-height: 0;
		border: 1px solid #ccc;
		border-radius: 4px;
		overflow: hidden;
	}
</style>

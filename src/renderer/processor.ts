import { MarkdownPostProcessorContext } from 'obsidian';
import type SingularityPlugin from '../main';
import { extractTaskId, buildSingularityUrl } from '../types';
import {
	createTaskBadge,
	createLoadingBadge,
	createErrorBadge,
} from './taskBadge';

/**
 * Register markdown post processor for Reading View
 */
export function registerMarkdownProcessor(plugin: SingularityPlugin): void {
	plugin.registerMarkdownPostProcessor(
		(el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			processElement(plugin, el);
		}
	);
}

/**
 * Process element and replace Singularity links with badges
 */
async function processElement(
	plugin: SingularityPlugin,
	el: HTMLElement
): Promise<void> {
	// 1. Find all <a> links with singularityapp:// protocol
	const links = el.querySelectorAll('a[href^="singularityapp://"]');

	const language = plugin.settings.language;

	for (const link of Array.from(links)) {
		const href = link.getAttribute('href');
		if (!href) continue;

		const taskId = extractTaskId(href);
		if (!taskId) continue;

		// Replace link with badge
		const badge = createLoadingBadge(taskId, language);
		link.replaceWith(badge);

		// Load task data asynchronously
		loadTaskData(plugin, badge, taskId, href);
	}

	// 2. Find inline URLs in text nodes (not wrapped in <a>)
	processInlineUrls(plugin, el);
}

/**
 * Process inline singularityapp:// URLs in text nodes
 */
function processInlineUrls(plugin: SingularityPlugin, el: HTMLElement): void {
	const walker = document.createTreeWalker(
		el,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				// Skip if parent is already a badge or link
				const parent = node.parentElement;
				if (
					parent?.classList.contains('singularity-task-badge') ||
					parent?.classList.contains('singularity-widget-container') ||
					parent?.tagName === 'A'
				) {
					return NodeFilter.FILTER_REJECT;
				}
				// Only accept nodes with singularityapp:// URLs
				if (node.textContent?.includes('singularityapp://')) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_REJECT;
			},
		}
	);

	const nodesToProcess: Text[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		nodesToProcess.push(node as Text);
	}

	// Process collected nodes (can't modify DOM during walking)
	for (const textNode of nodesToProcess) {
		replaceTextNodeWithBadges(plugin, textNode);
	}
}

/**
 * Replace text node containing singularityapp:// URLs with badges
 */
function replaceTextNodeWithBadges(
	plugin: SingularityPlugin,
	textNode: Text
): void {
	const text = textNode.textContent || '';
	const regex = /singularityapp:\/\/[^\s<>)"\]]+/g;
	const matches = [...text.matchAll(regex)];

	if (matches.length === 0) return;

	const language = plugin.settings.language;
	const fragment = document.createDocumentFragment();
	let lastIndex = 0;

	for (const match of matches) {
		const url = match[0];
		const index = match.index!;

		// Add text before the URL
		if (index > lastIndex) {
			fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
		}

		const taskId = extractTaskId(url);
		if (taskId) {
			// Create badge for this URL
			const badge = createLoadingBadge(taskId, language);
			fragment.appendChild(badge);
			loadTaskData(plugin, badge, taskId, url);
		} else {
			// Keep original text if no task ID found
			fragment.appendChild(document.createTextNode(url));
		}

		lastIndex = index + url.length;
	}

	// Add remaining text after last URL
	if (lastIndex < text.length) {
		fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
	}

	// Replace text node with fragment
	textNode.parentNode?.replaceChild(fragment, textNode);
}

/**
 * Load task data and update badge
 */
async function loadTaskData(
	plugin: SingularityPlugin,
	badge: HTMLElement,
	taskId: string,
	singularityUrl: string
): Promise<void> {
	const language = plugin.settings.language;
	try {
		const taskData = await plugin.cache.getTaskData(taskId);
		const newBadge = createTaskBadge(taskData, singularityUrl, language);
		badge.replaceWith(newBadge);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		const errorBadge = createErrorBadge(taskId, errorMessage, language);
		badge.replaceWith(errorBadge);
	}
}

/**
 * Process frontmatter properties for Singularity links
 * This handles the Properties view in Obsidian
 */
export function registerPropertiesProcessor(plugin: SingularityPlugin): void {
	// Use mutation observer to watch for property changes
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of Array.from(mutation.addedNodes)) {
				if (node instanceof HTMLElement) {
					processPropertiesElement(plugin, node);
				}
			}
		}
	});

	// Start observing when plugin loads
	plugin.app.workspace.onLayoutReady(() => {
		const container = document.body;
		observer.observe(container, {
			childList: true,
			subtree: true,
		});
	});

	// Cleanup on unload
	plugin.register(() => observer.disconnect());
}

/**
 * Process properties element for Singularity links
 */
async function processPropertiesElement(
	plugin: SingularityPlugin,
	el: HTMLElement
): Promise<void> {
	// Look for property values containing singularityapp://
	const propertyValues = el.querySelectorAll(
		'.metadata-property-value, .metadata-link-inner'
	);

	const language = plugin.settings.language;

	for (const valueEl of Array.from(propertyValues)) {
		const text = valueEl.textContent || '';

		if (text.includes('singularityapp://')) {
			const taskId = extractTaskId(text);
			if (!taskId) continue;

			// Check if already processed
			if (valueEl.querySelector('.singularity-task-badge')) continue;

			// Create and insert badge
			const badge = createLoadingBadge(taskId, language);
			valueEl.textContent = '';
			valueEl.appendChild(badge);

			// Load task data
			loadTaskData(plugin, badge, taskId, buildSingularityUrl(taskId));
		}
	}
}

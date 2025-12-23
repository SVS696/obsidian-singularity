import {
	EditorView,
	Decoration,
	DecorationSet,
	WidgetType,
	ViewPlugin,
	ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type SingularityPlugin from '../main';
import { extractTaskId, buildSingularityUrl, SINGULARITY_URL_REGEX } from '../types';
import { createTaskBadge, createLoadingBadge, createErrorBadge } from './taskBadge';

/**
 * Widget for rendering Singularity task badge in Live Preview
 */
class SingularityTaskWidget extends WidgetType {
	private plugin: SingularityPlugin;
	private taskId: string;
	private singularityUrl: string;

	constructor(plugin: SingularityPlugin, taskId: string, singularityUrl: string) {
		super();
		this.plugin = plugin;
		this.taskId = taskId;
		this.singularityUrl = singularityUrl;
	}

	toDOM(): HTMLElement {
		// Create container that will be updated
		const container = document.createElement('span');
		container.className = 'singularity-widget-container';

		// Show loading initially
		const loadingBadge = createLoadingBadge(this.taskId);
		container.appendChild(loadingBadge);

		// Load data and update DOM
		this.plugin.cache.getTaskData(this.taskId)
			.then((taskData) => {
				container.empty();
				const badge = createTaskBadge(taskData, this.singularityUrl);
				container.appendChild(badge);
			})
			.catch((err) => {
				container.empty();
				const errorMessage = err instanceof Error ? err.message : String(err);
				const errorBadge = createErrorBadge(this.taskId, errorMessage);
				container.appendChild(errorBadge);
			});

		return container;
	}

	eq(other: SingularityTaskWidget): boolean {
		return this.taskId === other.taskId;
	}

	get estimatedHeight(): number {
		return 24;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * Check if editor is in Live Preview mode (not Source mode)
 */
function isLivePreviewMode(view: EditorView): boolean {
	// In Obsidian, Live Preview mode has the class 'is-live-preview' on the view container
	const editorEl = view.dom.closest('.markdown-source-view');
	return editorEl?.classList.contains('is-live-preview') ?? false;
}

/**
 * Build decorations for Singularity links in the document
 */
function buildDecorations(view: EditorView, plugin: SingularityPlugin): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	// Don't render widgets in Source mode - only in Live Preview
	if (!isLivePreviewMode(view)) {
		return builder.finish();
	}

	const doc = view.state.doc;

	// Process each line
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const text = line.text;

		// Find all Singularity URLs in the line
		let match;
		const regex = new RegExp(SINGULARITY_URL_REGEX.source, 'gi');

		while ((match = regex.exec(text)) !== null) {
			const taskId = match[1];
			const start = line.from + match.index;
			const end = start + match[0].length;

			// Check if we're inside a markdown link
			const isInLink = isInsideMarkdownLink(text, match.index);

			if (isInLink) {
				// Find the full markdown link and replace it
				const linkMatch = findMarkdownLink(text, match.index);
				if (linkMatch) {
					const linkStart = line.from + linkMatch.start;
					const linkEnd = line.from + linkMatch.end;

					// Check if cursor is in this range
					const cursorInRange = view.state.selection.ranges.some(
						(range) => range.from >= linkStart && range.to <= linkEnd
					);

					if (!cursorInRange) {
						const widget = Decoration.replace({
							widget: new SingularityTaskWidget(
								plugin,
								taskId,
								buildSingularityUrl(taskId)
							),
						});
						builder.add(linkStart, linkEnd, widget);
					}
				}
			} else {
				// Plain URL - replace just the URL
				const cursorInRange = view.state.selection.ranges.some(
					(range) => range.from >= start && range.to <= end
				);

				if (!cursorInRange) {
					const widget = Decoration.replace({
						widget: new SingularityTaskWidget(
							plugin,
							taskId,
							buildSingularityUrl(taskId)
						),
					});
					builder.add(start, end, widget);
				}
			}
		}
	}

	return builder.finish();
}

/**
 * Check if position is inside a markdown link
 */
function isInsideMarkdownLink(text: string, position: number): boolean {
	// Look backwards for [
	let bracketStart = -1;
	for (let i = position - 1; i >= 0; i--) {
		if (text[i] === '[') {
			bracketStart = i;
			break;
		}
		if (text[i] === ']') {
			break;
		}
	}

	if (bracketStart === -1) return false;

	// Look for ](url) pattern
	const afterBracket = text.substring(bracketStart);
	const linkPattern = /^\[[^\]]*\]\([^)]*singularityapp:\/\/[^)]*\)/;

	return linkPattern.test(afterBracket);
}

/**
 * Find the full markdown link containing a Singularity URL
 */
function findMarkdownLink(
	text: string,
	urlPosition: number
): { start: number; end: number } | null {
	// Find the opening [
	let bracketStart = -1;
	for (let i = urlPosition - 1; i >= 0; i--) {
		if (text[i] === '[') {
			bracketStart = i;
			break;
		}
	}

	if (bracketStart === -1) return null;

	// Find the closing )
	let parenEnd = -1;
	for (let i = urlPosition; i < text.length; i++) {
		if (text[i] === ')') {
			parenEnd = i + 1;
			break;
		}
	}

	if (parenEnd === -1) return null;

	return { start: bracketStart, end: parenEnd };
}

/**
 * Create ViewPlugin for Live Preview
 */
export function createLivePreviewPlugin(plugin: SingularityPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = buildDecorations(update.view, plugin);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}

/**
 * Register Live Preview extension
 */
export function registerLivePreview(plugin: SingularityPlugin): void {
	plugin.registerEditorExtension(createLivePreviewPlugin(plugin));
}

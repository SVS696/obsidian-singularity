import type { TaskData } from '../types';
import { buildSingularityUrl } from '../types';

/**
 * Status colors for different kanban states
 */
const STATUS_COLORS: Record<string, string> = {
	TODO: '#6c757d',
	'IN-PROGRESS': '#0d6efd',
	DONE: '#198754',
	CANCELLED: '#dc3545',
};

/**
 * Get color for kanban status
 */
function getStatusColor(statusId: string): string {
	if (statusId === 'CANCELLED') return STATUS_COLORS['CANCELLED'];
	if (statusId.endsWith('-TODO')) return STATUS_COLORS['TODO'];
	if (statusId.endsWith('-IN-PROGRESS')) return STATUS_COLORS['IN-PROGRESS'];
	if (statusId.endsWith('-DONE')) return STATUS_COLORS['DONE'];
	// Custom status - use purple
	return '#6f42c1';
}

/**
 * Create task badge DOM element
 * Layout:
 * ┌──────────────────────────────────┐
 * │ [✓] 📋 Task Title        [Status]│
 * │ [tag1] [tag2] [tag3]             │
 * └──────────────────────────────────┘
 */
export function createTaskBadge(taskData: TaskData, singularityUrl: string): HTMLElement {
	const badge = document.createElement('div');
	badge.className = 'singularity-task-badge';
	badge.setAttribute('data-task-id', taskData.id);

	// Add completed/cancelled class
	if (taskData.isCancelled) {
		badge.classList.add('singularity-task-cancelled');
	} else if (taskData.isCompleted) {
		badge.classList.add('singularity-task-completed');
	}

	// Make clickable
	badge.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		window.open(singularityUrl);
	});

	// === Top row: checkbox + title + status ===
	const topRow = document.createElement('div');
	topRow.className = 'singularity-task-row';

	// Completion/cancelled checkbox indicator
	const checkboxEl = document.createElement('span');
	checkboxEl.className = 'singularity-task-checkbox';
	if (taskData.isCancelled) {
		checkboxEl.textContent = '✗';
		checkboxEl.title = 'Отменена';
		checkboxEl.classList.add('singularity-task-checkbox-cancelled');
	} else if (taskData.isCompleted) {
		checkboxEl.textContent = '✓';
		checkboxEl.title = 'Завершена';
	} else {
		checkboxEl.textContent = '○';
		checkboxEl.title = 'Не завершена';
	}
	topRow.appendChild(checkboxEl);

	// Title
	const titleEl = document.createElement('span');
	titleEl.className = 'singularity-task-title';
	titleEl.textContent = taskData.title;
	titleEl.title = taskData.title; // Full title on hover
	topRow.appendChild(titleEl);

	// Status badge (kanban column)
	if (taskData.status) {
		const statusEl = document.createElement('span');
		statusEl.className = 'singularity-task-status';
		statusEl.textContent = taskData.status.name;
		statusEl.style.backgroundColor = getStatusColor(taskData.status.id);
		topRow.appendChild(statusEl);
	}

	badge.appendChild(topRow);

	// === Bottom row: tags (only if there are tags) ===
	if (taskData.tags.length > 0) {
		const tagsRow = document.createElement('div');
		tagsRow.className = 'singularity-task-tags-row';

		for (const tag of taskData.tags) {
			const tagEl = document.createElement('span');
			tagEl.className = 'singularity-task-tag';
			tagEl.textContent = tag.title;
			if (tag.color) {
				tagEl.style.backgroundColor = tag.color;
				tagEl.style.color = isLightColor(tag.color) ? '#000' : '#fff';
			}
			tagsRow.appendChild(tagEl);
		}

		badge.appendChild(tagsRow);
	}

	return badge;
}

/**
 * Create loading placeholder badge
 */
export function createLoadingBadge(taskId: string): HTMLElement {
	const badge = document.createElement('div');
	badge.className = 'singularity-task-badge singularity-task-loading';
	badge.setAttribute('data-task-id', taskId);

	const topRow = document.createElement('div');
	topRow.className = 'singularity-task-row';

	const loadingEl = document.createElement('span');
	loadingEl.className = 'singularity-task-title';
	loadingEl.textContent = 'Loading...';
	topRow.appendChild(loadingEl);

	badge.appendChild(topRow);

	return badge;
}

/**
 * Create error badge
 */
export function createErrorBadge(taskId: string, error: string): HTMLElement {
	const badge = document.createElement('div');
	badge.className = 'singularity-task-badge singularity-task-error';
	badge.setAttribute('data-task-id', taskId);

	// Make clickable to open in Singularity anyway
	badge.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		window.open(buildSingularityUrl(taskId));
	});

	const topRow = document.createElement('div');
	topRow.className = 'singularity-task-row';

	const titleEl = document.createElement('span');
	titleEl.className = 'singularity-task-title';
	titleEl.textContent = `Task ${taskId.substring(0, 13)}...`;
	topRow.appendChild(titleEl);

	const errorEl = document.createElement('span');
	errorEl.className = 'singularity-task-status singularity-task-status-error';
	errorEl.textContent = 'Error';
	errorEl.title = error;
	topRow.appendChild(errorEl);

	badge.appendChild(topRow);

	return badge;
}

/**
 * Check if a hex color is light
 */
function isLightColor(hex: string): boolean {
	hex = hex.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 128;
}

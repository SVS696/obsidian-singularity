import type { TaskData, Language } from '../types';
import { buildSingularityUrl, LOCALES } from '../types';

const STATUS_COLORS: Record<string, string> = {
	TODO: '#6c757d',
	'IN-PROGRESS': '#0d6efd',
	DONE: '#198754',
	CANCELLED: '#dc3545',
};

function getStatusColor(statusId: string): string {
	if (statusId === 'CANCELLED') return STATUS_COLORS['CANCELLED'];
	if (statusId === 'DONE' || statusId.endsWith('-DONE')) return STATUS_COLORS['DONE'];
	if (statusId.endsWith('-TODO')) return STATUS_COLORS['TODO'];
	if (statusId.endsWith('-IN-PROGRESS')) return STATUS_COLORS['IN-PROGRESS'];
	return '#6f42c1';
}

export function createTaskBadge(taskData: TaskData, singularityUrl: string, language: Language = 'en'): HTMLElement {
	const badge = createDiv({ cls: 'singularity-task-badge' });
	badge.setAttribute('data-task-id', taskData.id);

	const locale = LOCALES[language];

	if (taskData.isCancelled) {
		badge.classList.add('singularity-task-cancelled');
	} else if (taskData.isCompleted) {
		badge.classList.add('singularity-task-completed');
	}

	badge.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		window.open(singularityUrl);
	});

	const topRow = badge.createDiv({ cls: 'singularity-task-row' });

	const checkboxEl = topRow.createSpan({ cls: 'singularity-task-checkbox' });
	if (taskData.isCancelled) {
		checkboxEl.textContent = '✗';
		checkboxEl.title = locale.tooltipCancelled;
		checkboxEl.classList.add('singularity-task-checkbox-cancelled');
	} else if (taskData.isCompleted) {
		checkboxEl.textContent = '✓';
		checkboxEl.title = locale.tooltipCompleted;
	} else {
		checkboxEl.textContent = '○';
		checkboxEl.title = locale.tooltipActive;
	}

	const titleEl = topRow.createSpan({ cls: 'singularity-task-title' });
	titleEl.textContent = taskData.title;
	titleEl.title = taskData.title;

	if (taskData.status) {
		const statusEl = topRow.createSpan({ cls: 'singularity-task-status' });
		statusEl.textContent = taskData.status.name;
		statusEl.style.backgroundColor = getStatusColor(taskData.status.id);
	}

	if (taskData.tags.length > 0) {
		const tagsRow = badge.createDiv({ cls: 'singularity-task-tags-row' });

		for (const tag of taskData.tags) {
			const tagEl = tagsRow.createSpan({ cls: 'singularity-task-tag' });
			tagEl.textContent = tag.title;
			if (tag.color) {
				tagEl.style.backgroundColor = tag.color;
				tagEl.style.color = isLightColor(tag.color) ? '#000' : '#fff';
			}
		}
	}

	return badge;
}

export function createLoadingBadge(taskId: string, language: Language = 'en'): HTMLElement {
	const badge = createDiv({ cls: 'singularity-task-badge singularity-task-loading' });
	badge.setAttribute('data-task-id', taskId);

	const locale = LOCALES[language];

	const topRow = badge.createDiv({ cls: 'singularity-task-row' });
	const loadingEl = topRow.createSpan({ cls: 'singularity-task-title' });
	loadingEl.textContent = locale.loading;

	return badge;
}

export function createErrorBadge(taskId: string, error: string, language: Language = 'en'): HTMLElement {
	const badge = createDiv({ cls: 'singularity-task-badge singularity-task-error' });
	badge.setAttribute('data-task-id', taskId);

	const locale = LOCALES[language];

	badge.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		window.open(buildSingularityUrl(taskId));
	});

	const topRow = badge.createDiv({ cls: 'singularity-task-row' });

	const titleEl = topRow.createSpan({ cls: 'singularity-task-title' });
	titleEl.textContent = `Task ${taskId.substring(0, 13)}...`;

	const errorEl = topRow.createSpan({ cls: 'singularity-task-status singularity-task-status-error' });
	errorEl.textContent = locale.error;
	errorEl.title = error;

	return badge;
}

function isLightColor(hex: string): boolean {
	hex = hex.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 128;
}

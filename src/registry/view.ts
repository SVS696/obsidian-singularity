import {
	ItemView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type SingularityPlugin from '../main';
import { buildSingularityUrl } from '../types';
import type {
	RegistryItem,
	RegistryResult,
	RegistryStage,
} from './types';

export const TASK_REGISTRY_VIEW_TYPE = 'singularity-task-registry';

type StageFilter = RegistryStage | 'active' | 'all';

const STAGE_ORDER: RegistryStage[] = [
	'attention',
	'drafting',
	'ready',
	'published',
	'waiting',
	'implementation-check',
	'planned',
	'archive',
];

const UI = {
	ru: {
		refresh: 'Обновить',
		refreshing: 'Обновление…',
		search: 'Поиск по постановке, задаче, тегу или ссылке',
		active: 'Активные',
		all: 'Все',
		updated: 'Данные на',
		live: 'синхронизированы',
		snapshot: 'сохранённый снимок',
		empty: 'В выбранном представлении ничего нет.',
		noSnapshot: 'Снимок ещё не создан. Выполните обновление.',
		noTask: 'Нет задачи Singularity',
		deadline: 'Дедлайн',
		modified: 'Изменено',
		openNote: 'Открыть заметку',
		openTask: 'Открыть задачу',
		stage: {
			drafting: 'В работе в Obsidian',
			ready: 'Готовы к публикации',
			published: 'Опубликованы',
			waiting: 'Ждут',
			'implementation-check': 'Сверка реализации',
			planned: 'Запланированы',
			attention: 'Требуют внимания',
			archive: 'Архив',
		} as Record<RegistryStage, string>,
	},
	en: {
		refresh: 'Refresh',
		refreshing: 'Refreshing…',
		search: 'Search notes, tasks, tags, or links',
		active: 'Active',
		all: 'All',
		updated: 'Data from',
		live: 'synced',
		snapshot: 'saved snapshot',
		empty: 'Nothing matches this view.',
		noSnapshot: 'No snapshot yet. Refresh the registry.',
		noTask: 'No Singularity task',
		deadline: 'Deadline',
		modified: 'Modified',
		openNote: 'Open note',
		openTask: 'Open task',
		stage: {
			drafting: 'In preparation',
			ready: 'Ready to publish',
			published: 'Published',
			waiting: 'Waiting',
			'implementation-check': 'Implementation check',
			planned: 'Planned',
			attention: 'Needs attention',
			archive: 'Archive',
		} as Record<RegistryStage, string>,
	},
};

export class TaskRegistryView extends ItemView {
	private plugin: SingularityPlugin;
	private result: RegistryResult | null = null;
	private query = '';
	private stageFilter: StageFilter = 'active';
	private refreshing = false;

	constructor(leaf: WorkspaceLeaf, plugin: SingularityPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TASK_REGISTRY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.plugin.settings.registryTitle;
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.addAction('refresh-cw', 'Refresh task registry', () => {
			void this.refresh();
		});

		const snapshot =
			this.plugin.registry.getSnapshot() ??
			(await this.plugin.registry.loadSnapshot());
		if (snapshot) {
			this.result = { snapshot, source: 'snapshot' };
		}
		this.render();
		void this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		this.render();

		try {
			this.result = await this.plugin.registry.refresh();
			if (this.result.source === 'snapshot') {
				new Notice('Singularity is unavailable; using saved task data');
			}
		} catch (error) {
			new Notice(
				error instanceof Error
					? error.message
					: 'Task registry refresh failed'
			);
		} finally {
			this.refreshing = false;
			this.render();
		}
	}

	private render(): void {
		const locale = UI[this.plugin.settings.language];
		const container = this.contentEl;
		container.empty();
		container.addClass('singularity-registry');

		const header = container.createDiv({ cls: 'singularity-registry-header' });
		const heading = header.createDiv();
		heading.createEl('h2', {
			text: this.plugin.settings.registryTitle,
		});

		if (this.result) {
			const generatedAt = new Date(this.result.snapshot.generatedAt);
			const status = heading.createEl('p', {
				cls: `singularity-registry-freshness is-${this.result.source}`,
				text: `${locale.updated} ${generatedAt.toLocaleString()} · ${
					this.result.source === 'live' ? locale.live : locale.snapshot
				}`,
			});
			if (this.result.error) {
				status.title = this.result.error;
			}
		}

		const refreshButton = header.createEl('button', {
			cls: 'clickable-icon singularity-registry-refresh',
			attr: {
				'aria-label': locale.refresh,
			},
		});
		refreshButton.disabled = this.refreshing;
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.createSpan({
			text: this.refreshing ? locale.refreshing : locale.refresh,
		});
		refreshButton.addEventListener('click', () => void this.refresh());

		if (!this.result) {
			container.createEl('p', {
				cls: 'singularity-registry-empty',
				text: this.refreshing ? locale.refreshing : locale.noSnapshot,
			});
			return;
		}

		this.renderSummary(container, this.result.snapshot.items);
		this.renderFilters(container);
		this.renderItems(container, this.filteredItems());
	}

	private renderSummary(container: HTMLElement, items: RegistryItem[]): void {
		const locale = UI[this.plugin.settings.language];
		const summary = container.createDiv({
			cls: 'singularity-registry-summary',
		});

		for (const stage of STAGE_ORDER) {
			const count = items.filter((item) => item.stage === stage).length;
			const card = summary.createEl('button', {
				cls: `singularity-registry-summary-card stage-${stage}`,
				attr: { type: 'button' },
			});
			card.createSpan({
				cls: 'singularity-registry-summary-count',
				text: String(count),
			});
			card.createSpan({
				cls: 'singularity-registry-summary-label',
				text: locale.stage[stage],
			});
			card.addEventListener('click', () => {
				this.stageFilter = stage;
				this.render();
			});
		}
	}

	private renderFilters(container: HTMLElement): void {
		const locale = UI[this.plugin.settings.language];
		const filters = container.createDiv({
			cls: 'singularity-registry-filters',
		});
		const search = filters.createEl('input', {
			type: 'search',
			placeholder: locale.search,
			value: this.query,
		});
		search.addEventListener('input', () => {
			this.query = search.value;
			this.render();
		});

		const select = filters.createEl('select');
		select.createEl('option', {
			value: 'active',
			text: locale.active,
		});
		select.createEl('option', {
			value: 'all',
			text: locale.all,
		});
		for (const stage of STAGE_ORDER) {
			select.createEl('option', {
				value: stage,
				text: locale.stage[stage],
			});
		}
		select.value = this.stageFilter;
		select.addEventListener('change', () => {
			this.stageFilter = select.value as StageFilter;
			this.render();
		});
	}

	private filteredItems(): RegistryItem[] {
		if (!this.result) return [];
		const query = this.query.normalize('NFKC').trim().toLowerCase();

		return this.result.snapshot.items
			.filter((item) => {
				if (this.stageFilter === 'active' && item.stage === 'archive') {
					return false;
				}
				if (
					this.stageFilter !== 'active' &&
					this.stageFilter !== 'all' &&
					item.stage !== this.stageFilter
				) {
					return false;
				}
				if (!query) return true;

				const searchable = [
					item.title,
					item.path,
					item.documentType,
					...item.notes.flatMap((note) => [
						note.title,
						note.path,
						note.documentType,
					]),
					...item.tasks.flatMap((task) => [
						task.title,
						task.projectTitle ?? '',
						task.status?.name ?? '',
						...task.tags.map((tag) => tag.title),
					]),
					...item.externalLinks.map((link) => link.url),
				]
					.join(' ')
					.normalize('NFKC')
					.toLowerCase();
				return searchable.includes(query);
			})
			.sort((left, right) => {
				const stageDelta =
					STAGE_ORDER.indexOf(left.stage) -
					STAGE_ORDER.indexOf(right.stage);
				if (stageDelta !== 0) return stageDelta;
				return right.modifiedAt.localeCompare(left.modifiedAt);
			});
	}

	private renderItems(container: HTMLElement, items: RegistryItem[]): void {
		const locale = UI[this.plugin.settings.language];
		if (items.length === 0) {
			container.createEl('p', {
				cls: 'singularity-registry-empty',
				text: locale.empty,
			});
			return;
		}

		const list = container.createDiv({ cls: 'singularity-registry-list' });
		for (const item of items) {
			const row = list.createDiv({
				cls: `singularity-registry-item stage-${item.stage}`,
			});

			const primary = row.createDiv({
				cls: 'singularity-registry-item-primary',
			});
			primary.createSpan({
				cls: 'singularity-registry-stage',
				text: locale.stage[item.stage],
			});
			const noteButton = primary.createEl('button', {
				cls: 'singularity-registry-note-link',
				text: item.title,
				attr: { type: 'button', title: locale.openNote },
			});
			noteButton.addEventListener('click', () => {
				void this.openNote(item.path);
			});
			primary.createSpan({
				cls: 'singularity-registry-document-type',
				text: item.documentType,
			});
			if (item.notes.length > 1) {
				const relatedNotes = primary.createDiv({
					cls: 'singularity-registry-related-notes',
				});
				for (const note of item.notes.filter(
					(note) => note.path !== item.path
				)) {
					const relatedButton = relatedNotes.createEl('button', {
						cls: 'singularity-registry-related-note-link',
						text: note.title,
						attr: { type: 'button', title: locale.openNote },
					});
					relatedButton.addEventListener('click', () => {
						void this.openNote(note.path);
					});
					relatedNotes.createSpan({
						text: note.documentType,
					});
				}
			}

			const taskColumn = row.createDiv({
				cls: 'singularity-registry-task-column',
			});
			if (item.tasks.length === 0) {
				taskColumn.createSpan({
					cls: 'singularity-registry-muted',
					text: locale.noTask,
				});
			}
			for (const task of item.tasks) {
				const taskRow = taskColumn.createDiv({
					cls: 'singularity-registry-task',
				});
				const taskButton = taskRow.createEl('button', {
					cls: 'singularity-registry-task-link',
					text: task.title,
					attr: { type: 'button', title: locale.openTask },
				});
				taskButton.addEventListener('click', () => {
					window.open(buildSingularityUrl(task.id));
				});
				taskRow.createSpan({
					cls: 'singularity-registry-task-state',
					text: [task.projectTitle, task.status?.name]
						.filter(Boolean)
						.join(' · '),
				});
				if (task.tags.length > 0) {
					const tags = taskRow.createDiv({
						cls: 'singularity-registry-tags',
					});
					for (const tag of task.tags) {
						tags.createSpan({
							cls: 'singularity-registry-tag',
							text: tag.title,
						});
					}
				}
			}

			const links = row.createDiv({
				cls: 'singularity-registry-links',
			});
			for (const link of item.externalLinks) {
				const external = links.createEl('a', {
					text: link.field,
					href: link.url,
				});
				external.setAttr('target', '_blank');
				external.setAttr('rel', 'noopener');
			}

			const deadlines = item.tasks
				.map((task) => task.deadline)
				.filter((deadline): deadline is string => Boolean(deadline));
			const metadata = row.createDiv({
				cls: 'singularity-registry-metadata',
			});
			if (deadlines.length > 0) {
				metadata.createSpan({
					text: `${locale.deadline}: ${new Date(
						deadlines.sort()[0]
					).toLocaleDateString()}`,
				});
			}
			metadata.createSpan({
				text: `${locale.modified}: ${new Date(
					item.modifiedAt
				).toLocaleDateString()}`,
			});

			if (item.conflicts.length > 0) {
				const conflicts = row.createEl('ul', {
					cls: 'singularity-registry-conflicts',
				});
				for (const conflict of item.conflicts) {
					conflicts.createEl('li', { text: conflict });
				}
			}
		}
	}

	private async openNote(path: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`Note not found: ${path}`);
			return;
		}
		await this.plugin.app.workspace.getLeaf(false).openFile(file);
	}
}

import {
	ItemView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type SingularityPlugin from '../main';
import {
	buildSingularityUrl,
	type RegistryProfileSettings,
} from '../types';
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
	'triage',
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
		profile: 'Контур',
		noProfiles:
			'Нет включённых контуров реестра. Добавьте и включите контур в настройках плагина.',
		stage: {
			drafting: 'В работе в Obsidian',
			ready: 'Готовы к публикации',
			published: 'Опубликованы',
			waiting: 'Ждут',
			'implementation-check': 'Сверка реализации',
			planned: 'Запланированы',
			attention: 'Требуют внимания',
			triage: 'Разобрать старое',
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
		profile: 'Profile',
		noProfiles:
			'No registry profiles are enabled. Add and enable one in the plugin settings.',
		stage: {
			drafting: 'In preparation',
			ready: 'Ready to publish',
			published: 'Published',
			waiting: 'Waiting',
			'implementation-check': 'Implementation check',
			planned: 'Planned',
			attention: 'Needs attention',
			triage: 'Triage old',
			archive: 'Archive',
		} as Record<RegistryStage, string>,
	},
};

export class TaskRegistryView extends ItemView {
	private plugin: SingularityPlugin;
	private result: RegistryResult | null = null;
	private query = '';
	private stageFilter: StageFilter = 'active';
	private refreshingProfiles = new Set<string>();
	private currentProfileId: string | null = null;
	private itemsContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SingularityPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TASK_REGISTRY_VIEW_TYPE;
	}

	getDisplayText(): string {
		const profiles = this.plugin.registry.getProfiles();
		return profiles.length === 1 ? profiles[0].name : 'Task registries';
	}

	getIcon(): string {
		return 'list-checks';
	}

	async onOpen(): Promise<void> {
		this.addAction('refresh-cw', 'Refresh task registry', () => {
			void this.refresh();
		});

		const profile = this.plugin.registry.getProfiles()[0];
		this.currentProfileId = profile?.id ?? null;
		if (profile) {
			const snapshot =
				this.plugin.registry.getSnapshot(profile.id) ??
				(await this.plugin.registry.loadSnapshot(profile.id));
			if (snapshot) {
				this.result = { snapshot, source: 'snapshot' };
			}
		}
		this.render();
		if (profile) void this.refresh();
	}

	async refresh(): Promise<void> {
		const profileId = this.currentProfileId;
		if (!profileId || this.refreshingProfiles.has(profileId)) return;
		this.refreshingProfiles.add(profileId);
		this.render();

		try {
			const result = await this.plugin.registry.refresh(profileId);
			if (this.currentProfileId !== profileId) return;
			this.result = result;
			if (result.source === 'snapshot') {
				new Notice('Singularity is unavailable; using saved task data');
			}
		} catch (error) {
			if (this.currentProfileId === profileId) {
				new Notice(
					error instanceof Error
						? error.message
						: 'Task registry refresh failed'
				);
			}
		} finally {
			this.refreshingProfiles.delete(profileId);
			if (this.currentProfileId === profileId) {
				this.render();
			}
		}
	}

	private async selectProfile(profileId: string): Promise<void> {
		if (profileId === this.currentProfileId) return;
		this.currentProfileId = profileId;
		this.result = null;
		this.query = '';
		this.stageFilter = 'active';

		let snapshot = this.plugin.registry.getSnapshot(profileId);
		try {
			snapshot ??= await this.plugin.registry.loadSnapshot(profileId);
		} catch (error) {
			if (this.currentProfileId === profileId) {
				new Notice(
					error instanceof Error
						? error.message
						: 'Task registry profile could not be loaded'
				);
				this.render();
			}
			return;
		}
		if (this.currentProfileId !== profileId) return;
		if (snapshot) {
			this.result = { snapshot, source: 'snapshot' };
		}
		this.render();
		void this.refresh();
	}

	private render(): void {
		const locale = UI[this.plugin.settings.language];
		const container = this.contentEl;
		this.itemsContainer = null;
		container.empty();
		container.addClass('singularity-registry');
		const profiles = this.plugin.registry.getProfiles();
		const profile =
			profiles.find((item) => item.id === this.currentProfileId) ??
			profiles[0] ??
			null;

		if (!profile) {
			this.currentProfileId = null;
			container.createEl('h2', { text: 'Task registries' });
			container.createEl('p', {
				cls: 'singularity-registry-empty',
				text: locale.noProfiles,
			});
			return;
		}
		this.currentProfileId = profile.id;
		const refreshing = this.refreshingProfiles.has(profile.id);

		const header = container.createDiv({ cls: 'singularity-registry-header' });
		const heading = header.createDiv();
		heading.createEl('h2', {
			text: profile.name,
		});
		this.renderProfilePicker(heading, profiles, profile, locale.profile);

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
		refreshButton.disabled = refreshing;
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.createSpan({
			text: refreshing ? locale.refreshing : locale.refresh,
		});
		refreshButton.addEventListener('click', () => void this.refresh());

		if (!this.result) {
			container.createEl('p', {
				cls: 'singularity-registry-empty',
				text: refreshing ? locale.refreshing : locale.noSnapshot,
			});
			return;
		}

		this.renderSummary(container, this.result.snapshot.items);
		this.renderFilters(container);
		this.itemsContainer = container.createDiv({
			cls: 'singularity-registry-results',
		});
		this.renderFilteredItems();
	}

	private renderProfilePicker(
		container: HTMLElement,
		profiles: RegistryProfileSettings[],
		profile: RegistryProfileSettings,
		label: string
	): void {
		if (profiles.length < 2) return;
		const wrapper = container.createDiv({
			cls: 'singularity-registry-profile-picker',
		});
		wrapper.createSpan({ text: label });
		const select = wrapper.createEl('select');
		for (const option of profiles) {
			select.createEl('option', {
				value: option.id,
				text: option.name,
			});
		}
		select.value = profile.id;
		select.addEventListener('change', () => {
			void this.selectProfile(select.value);
		});
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
			this.renderFilteredItems();
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
			this.renderFilteredItems();
		});
	}

	private renderFilteredItems(): void {
		if (!this.itemsContainer) return;
		this.itemsContainer.empty();
		this.renderItems(this.itemsContainer, this.filteredItems());
	}

	private filteredItems(): RegistryItem[] {
		if (!this.result) return [];
		const query = this.query.normalize('NFKC').trim().toLowerCase();

		return this.result.snapshot.items
			.filter((item) => {
				if (
					this.stageFilter === 'active' &&
					(item.stage === 'archive' || item.stage === 'triage')
				) {
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
			if (!item.companionOnly) {
				primary.createSpan({
					cls: 'singularity-registry-document-type',
					text: item.documentType,
				});
			}
			if (item.notes.length > 1 || item.companionOnly) {
				const relatedNotes = primary.createDiv({
					cls: 'singularity-registry-related-notes',
				});
				for (const note of item.notes.filter(
					(note) => item.companionOnly || note.path !== item.path
				)) {
					const relatedNote = relatedNotes.createDiv({
						cls: 'singularity-registry-related-note',
					});
					const relatedButton = relatedNote.createEl('button', {
						cls: 'singularity-registry-related-note-link',
						text: note.title,
						attr: { type: 'button', title: locale.openNote },
					});
					relatedButton.addEventListener('click', () => {
						void this.openNote(note.path);
					});
					relatedNote.createSpan({
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

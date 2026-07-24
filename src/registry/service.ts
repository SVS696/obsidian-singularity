import type SingularityPlugin from '../main';
import type { SingularityTask } from '../types';
import type { RegistryNoteSource, RegistryResult, RegistrySnapshot } from './types';
import {
	buildRegistryItems,
	enrichTasks,
	extractExternalLinks,
	extractTaskIds,
	inferDocumentType,
	splitSetting,
} from './model';
import { RegistrySnapshotStore } from './snapshotStore';

/**
 * Singularity's task list can omit old or removed tasks even when include flags
 * are set. Recover only IDs referenced by the registry and absent from the
 * batch response, with bounded concurrency to avoid hammering the API.
 */
export async function recoverMissingTasks(
	tasks: SingularityTask[],
	requestedIds: Iterable<string>,
	loadTask: (taskId: string) => Promise<SingularityTask>,
	concurrency = 6
): Promise<SingularityTask[]> {
	const knownIds = new Set(tasks.map((task) => task.id));
	const missingIds = Array.from(new Set(requestedIds)).filter(
		(taskId) => !knownIds.has(taskId)
	);
	const recovered: SingularityTask[] = [];
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (nextIndex < missingIds.length) {
			const taskId = missingIds[nextIndex++];
			try {
				recovered.push(await loadTask(taskId));
			} catch {
				// A genuinely inaccessible task remains visible as a registry conflict.
			}
		}
	};

	const workerCount = Math.min(
		Math.max(1, concurrency),
		missingIds.length
	);
	await Promise.all(
		Array.from({ length: workerCount }, () => worker())
	);

	return [...tasks, ...recovered];
}

export class TaskRegistryService {
	private plugin: SingularityPlugin;
	private currentSnapshot: RegistrySnapshot | null = null;

	constructor(plugin: SingularityPlugin) {
		this.plugin = plugin;
	}

	getSnapshot(): RegistrySnapshot | null {
		return this.currentSnapshot;
	}

	async loadSnapshot(): Promise<RegistrySnapshot | null> {
		const snapshot = await this.getStore().load();
		if (snapshot) {
			this.currentSnapshot = snapshot;
			this.plugin.cache.hydrateTaskEntries(snapshot.taskEntries);
		}
		return snapshot;
	}

	async refresh(): Promise<RegistryResult> {
		const notes = this.collectNotes();
		const linkedTaskIds = new Set(
			notes.flatMap((note) => note.taskIds)
		);

		try {
			const [listedTasks, projects, statuses, taskStatuses, tags] =
				await Promise.all([
					this.plugin.api.getTasks(),
					this.plugin.api.getProjects(),
					this.plugin.api.getAllKanbanStatuses(),
					this.plugin.api.getAllTaskKanbanStatuses(),
					this.plugin.api.getTags(),
				]);
			const tasks = await recoverMissingTasks(
				listedTasks,
				linkedTaskIds,
				(taskId) => this.plugin.api.getTask(taskId)
			);

			const generatedAt = new Date();
			const taskData = enrichTasks(
				tasks.filter((task) => linkedTaskIds.has(task.id)),
				projects,
				statuses,
				taskStatuses,
				tags,
				this.plugin.settings.language,
				generatedAt.getTime()
			);
			const deliveryProjects = splitSetting(
				this.plugin.settings.registryDeliveryProjects
			);
			const items = buildRegistryItems(notes, taskData, {
				sourceProject: this.plugin.settings.registrySourceProject,
				deliveryProjects,
				waitingTags: splitSetting(
					this.plugin.settings.registryWaitingTags
				),
			});

			for (const task of taskData) {
				this.plugin.cache.putTaskData(task, generatedAt.getTime());
			}

			const snapshot: RegistrySnapshot = {
				schemaVersion: 1,
				generatedAt: generatedAt.toISOString(),
				scope: {
					folders: this.getFolders(),
					sourceProject: this.plugin.settings.registrySourceProject,
					deliveryProjects,
					externalLinkFields: this.getExternalLinkFields(),
				},
				taskEntries: this.plugin.cache.exportTaskEntries(
					Array.from(linkedTaskIds)
				),
				items,
			};

			// A failed write must not replace the last successful snapshot.
			await this.getStore().save(snapshot);
			this.currentSnapshot = snapshot;
			return { snapshot, source: 'live' };
		} catch (error) {
			const snapshot = this.currentSnapshot ?? (await this.loadSnapshot());
			if (!snapshot) {
				throw error;
			}
			return {
				snapshot,
				source: 'snapshot',
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private getStore(): RegistrySnapshotStore {
		return new RegistrySnapshotStore(
			this.plugin.app.vault.adapter,
			this.plugin.settings.registrySnapshotPath
		);
	}

	private getFolders(): string[] {
		return splitSetting(this.plugin.settings.registryFolders).map((folder) =>
			folder.replace(/^\/+|\/+$/g, '')
		);
	}

	private getExternalLinkFields(): string[] {
		const fields = splitSetting(
			this.plugin.settings.registryExternalLinkFields
		);
		return fields.length > 0 ? fields : ['redmine'];
	}

	private collectNotes(): RegistryNoteSource[] {
		const folders = this.getFolders();
		const externalLinkFields = this.getExternalLinkFields();
		const files = this.plugin.app.vault.getMarkdownFiles().filter((file) => {
			if (folders.length === 0) return true;
			return folders.some(
				(folder) =>
					file.path === folder || file.path.startsWith(`${folder}/`)
			);
		});

		return files.map((file) => {
			const frontmatter =
				this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			return {
				path: file.path,
				title: file.basename,
				modifiedAt: new Date(file.stat.mtime).toISOString(),
				documentType: inferDocumentType(
					file.path,
					frontmatter.document_type
				),
				taskIds: extractTaskIds(frontmatter),
				externalLinks: extractExternalLinks(
					frontmatter,
					externalLinkFields
				),
			};
		});
	}
}

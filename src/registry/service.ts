import type SingularityPlugin from '../main';
import type { RegistryProfileSettings, SingularityTask } from '../types';
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
import {
	duplicateSnapshotProfile,
	enabledRegistryProfiles,
} from './profiles';

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

export function pathMatchesRegistryFolders(
	path: string,
	folders: string[]
): boolean {
	if (folders.length === 0) return true;
	return folders.some(
		(folder) => path === folder || path.startsWith(`${folder}/`)
	);
}

export class TaskRegistryService {
	private plugin: SingularityPlugin;
	private currentSnapshots = new Map<string, RegistrySnapshot>();

	constructor(plugin: SingularityPlugin) {
		this.plugin = plugin;
	}

	getProfiles(): RegistryProfileSettings[] {
		return enabledRegistryProfiles(this.plugin.settings);
	}

	getProfile(profileId: string): RegistryProfileSettings | null {
		return (
			this.plugin.settings.registryProfiles.find(
				(profile) => profile.id === profileId
			) ?? null
		);
	}

	getSnapshot(profileId: string): RegistrySnapshot | null {
		return this.currentSnapshots.get(profileId) ?? null;
	}

	async loadSnapshot(profileId: string): Promise<RegistrySnapshot | null> {
		const profile = this.requireProfile(profileId);
		const snapshot = await this.getStore(profile).load();
		if (snapshot) {
			this.currentSnapshots.set(profile.id, snapshot);
			this.plugin.cache.hydrateTaskEntries(snapshot.taskEntries);
		}
		return snapshot;
	}

	async loadAllSnapshots(): Promise<void> {
		await Promise.all(
			this.getProfiles().map(async (profile) => {
				try {
					await this.loadSnapshot(profile.id);
				} catch (error) {
					console.warn(
						`[Singularity] Failed to load registry profile ${profile.id}:`,
						error
					);
				}
			})
		);
	}

	async refresh(profileId: string): Promise<RegistryResult> {
		const profile = this.requireProfile(profileId);
		const notes = this.collectNotes(profile);
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
			const deliveryProjects = splitSetting(profile.deliveryProjects);
			const items = buildRegistryItems(notes, taskData, {
				sourceProject: profile.sourceProject,
				deliveryProjects,
				waitingTags: splitSetting(profile.waitingTags),
				triageAfterDays: profile.triageAfterDays,
				now: generatedAt.getTime(),
			});

			for (const task of taskData) {
				this.plugin.cache.putTaskData(task, generatedAt.getTime());
			}

			const snapshot: RegistrySnapshot = {
				schemaVersion: 1,
				generatedAt: generatedAt.toISOString(),
				scope: {
					profileId: profile.id,
					profileName: profile.name,
					folders: this.getFolders(profile),
					sourceProject: profile.sourceProject,
					deliveryProjects,
					externalLinkFields: this.getExternalLinkFields(profile),
					triageAfterDays: profile.triageAfterDays,
				},
				taskEntries: this.plugin.cache.exportTaskEntries(
					Array.from(linkedTaskIds)
				),
				items,
			};

			// A failed write must not replace the last successful snapshot.
			await this.getStore(profile).save(snapshot);
			this.currentSnapshots.set(profile.id, snapshot);
			return { snapshot, source: 'live' };
		} catch (error) {
			const snapshot =
				this.currentSnapshots.get(profile.id) ??
				(await this.loadSnapshot(profile.id));
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

	private requireProfile(profileId: string): RegistryProfileSettings {
		const profile = this.getProfile(profileId);
		if (!profile || !profile.enabled || !this.plugin.settings.registryEnabled) {
			throw new Error(`Task registry profile is unavailable: ${profileId}`);
		}
		if (!profile.snapshotPath.trim()) {
			throw new Error(
				`Task registry profile "${profile.name}" has no snapshot path`
			);
		}
		const duplicate = duplicateSnapshotProfile(
			profile,
			this.plugin.settings.registryProfiles
		);
		if (duplicate) {
			throw new Error(
				`Task registry profiles "${profile.name}" and "${duplicate.name}" use the same snapshot path`
			);
		}
		return profile;
	}

	private getStore(profile: RegistryProfileSettings): RegistrySnapshotStore {
		return new RegistrySnapshotStore(
			this.plugin.app.vault.adapter,
			profile.snapshotPath
		);
	}

	private getFolders(profile: RegistryProfileSettings): string[] {
		return splitSetting(profile.folders).map((folder) =>
			folder.replace(/^\/+|\/+$/g, '')
		);
	}

	private getExternalLinkFields(profile: RegistryProfileSettings): string[] {
		return splitSetting(profile.externalLinkFields);
	}

	private collectNotes(profile: RegistryProfileSettings): RegistryNoteSource[] {
		const folders = this.getFolders(profile);
		const externalLinkFields = this.getExternalLinkFields(profile);
		const files = this.plugin.app.vault.getMarkdownFiles().filter((file) => {
			return pathMatchesRegistryFolders(file.path, folders);
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

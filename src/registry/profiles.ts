import type {
	RegistryProfileSettings,
	SingularityPluginSettings,
} from '../types';

const DEFAULT_PROFILE: Omit<RegistryProfileSettings, 'id' | 'name'> = {
	enabled: true,
	folders: '',
	sourceProject: '',
	deliveryProjects: '',
	externalLinkFields: 'redmine, jira',
	waitingTags: 'waiting, wait',
	companionPrefixes: 'вопрос, вопросы, вопросам, question, questions',
	companionSuffixes: 'вопрос, вопросы, вопросам, question, questions',
	triageAfterDays: 90,
	snapshotPath: '',
};

function cleanId(value: string): string {
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

export function createRegistryProfileId(
	existing: Iterable<string>,
	hint = 'registry'
): string {
	const used = new Set(existing);
	const base = cleanId(hint) || 'registry';
	let candidate = base;
	let suffix = 2;
	while (used.has(candidate)) {
		candidate = `${base}-${suffix++}`;
	}
	return candidate;
}

export function createRegistryProfile(
	overrides: Partial<RegistryProfileSettings> = {},
	existingIds: Iterable<string> = []
): RegistryProfileSettings {
	const id = createRegistryProfileId(
		existingIds,
		overrides.id || overrides.name || 'registry'
	);
	return {
		...DEFAULT_PROFILE,
		...overrides,
		id,
		name: overrides.name?.trim() || 'Task registry',
		companionPrefixes:
			overrides.companionPrefixes ?? DEFAULT_PROFILE.companionPrefixes,
		companionSuffixes:
			overrides.companionSuffixes ?? DEFAULT_PROFILE.companionSuffixes,
		snapshotPath:
			overrides.snapshotPath?.trim() ||
			`.singularity/task-registry-${id}.json`,
		triageAfterDays: Number.isFinite(overrides.triageAfterDays)
			? Math.max(1, Number(overrides.triageAfterDays))
			: DEFAULT_PROFILE.triageAfterDays,
	};
}

function hasLegacyRegistryConfiguration(
	data: Partial<SingularityPluginSettings>
): boolean {
	return Boolean(
		data.registryEnabled ||
			data.registryFolders?.trim() ||
			data.registrySourceProject?.trim() ||
			data.registryDeliveryProjects?.trim() ||
			data.registryTitle?.trim() ||
			data.registrySnapshotPath?.trim()
	);
}

/**
 * Normalize profile data and migrate the 1.2.x single-registry settings.
 */
export function migrateRegistryProfiles(
	data: Partial<SingularityPluginSettings>
): RegistryProfileSettings[] {
	const rawProfiles = Array.isArray(data.registryProfiles)
		? data.registryProfiles
		: null;
	const profiles =
		rawProfiles !== null
			? rawProfiles
			: hasLegacyRegistryConfiguration(data)
				? [
						{
							id: 'legacy-default',
							name: data.registryTitle || 'Task registry',
							enabled: data.registryEnabled ?? true,
							folders: data.registryFolders || '',
							sourceProject: data.registrySourceProject || '',
							deliveryProjects: data.registryDeliveryProjects || '',
							externalLinkFields:
								data.registryExternalLinkFields || 'redmine, jira',
							waitingTags: data.registryWaitingTags || 'waiting, wait',
							companionPrefixes: DEFAULT_PROFILE.companionPrefixes,
							companionSuffixes: DEFAULT_PROFILE.companionSuffixes,
							triageAfterDays:
								data.registryTriageAfterDays ??
								DEFAULT_PROFILE.triageAfterDays,
							snapshotPath:
								data.registrySnapshotPath ||
								'.singularity/task-registry.json',
						},
					]
				: [];

	const normalized: RegistryProfileSettings[] = [];
	for (const profile of profiles) {
		normalized.push(
			createRegistryProfile(profile, normalized.map((item) => item.id))
		);
	}
	return normalized;
}

export function enabledRegistryProfiles(
	settings: SingularityPluginSettings
): RegistryProfileSettings[] {
	if (!settings.registryEnabled) return [];
	return settings.registryProfiles.filter((profile) => profile.enabled);
}

function normalizeSnapshotPath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.normalize('NFKC')
		.toLowerCase();
}

export function duplicateSnapshotProfile(
	profile: RegistryProfileSettings,
	profiles: RegistryProfileSettings[]
): RegistryProfileSettings | null {
	const path = normalizeSnapshotPath(profile.snapshotPath);
	if (!path) return null;
	return (
		profiles.find(
			(candidate) =>
				candidate.id !== profile.id &&
				candidate.enabled &&
				normalizeSnapshotPath(candidate.snapshotPath) === path
		) ?? null
	);
}

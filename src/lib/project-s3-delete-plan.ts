import type { Dataset } from "@/app/spaces/dataset/dataset-types";
import { collectS3KeysFromProjectSpaces, collectS3KeysFromValue } from "@/lib/s3-media-hydrate";
import type { ProjectRecord } from "@/lib/spaces-dynamo-store";

export function collectS3KeysFromProjectRecord(project: ProjectRecord): string[] {
  return [
    ...new Set([
      ...collectS3KeysFromProjectSpaces(project.spaces || {}),
      ...collectS3KeysFromValue(project.metadata || {}),
    ]),
  ];
}

export function collectS3KeysFromGlobalDatasets(datasets: Dataset[]): string[] {
  const keys = new Set<string>();
  for (const dataset of datasets) {
    for (const key of collectS3KeysFromValue(dataset)) {
      keys.add(key);
    }
  }
  return [...keys];
}

export function collectRetainedS3KeysForProjectDelete(args: {
  excludeProjectId: string;
  otherProjects: ProjectRecord[];
  globalDatasets: Dataset[];
}): Set<string> {
  const retained = new Set<string>();
  for (const project of args.otherProjects) {
    if (project.id === args.excludeProjectId) continue;
    for (const key of collectS3KeysFromProjectRecord(project)) {
      retained.add(key);
    }
  }
  for (const key of collectS3KeysFromGlobalDatasets(args.globalDatasets)) {
    retained.add(key);
  }
  return retained;
}

export function planProjectS3Deletes(args: {
  projectToDelete: ProjectRecord;
  otherProjects: ProjectRecord[];
  globalDatasets: Dataset[];
}): {
  candidateKeys: string[];
  deleteKeys: string[];
  retainedKeys: string[];
} {
  const candidateKeys = collectS3KeysFromProjectRecord(args.projectToDelete);
  const retainedSet = collectRetainedS3KeysForProjectDelete({
    excludeProjectId: args.projectToDelete.id,
    otherProjects: args.otherProjects,
    globalDatasets: args.globalDatasets,
  });
  const retainedKeys = candidateKeys.filter((key) => retainedSet.has(key));
  const deleteKeys = candidateKeys.filter((key) => !retainedSet.has(key));
  return { candidateKeys, deleteKeys, retainedKeys };
}

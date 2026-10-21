import { saveTextFile } from '../platform/saveTextFile';
/**
 * Purpose: Document state, import, file, or persistence module for projectFile.
 */
import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from '../lib/project';

export function downloadProject(snapshot: ProjectSnapshot): string {
    const raw = serializeProject(snapshot);
    const base = (snapshot.fileName || 'project').replace(/\.[^.]+$/, '');
    saveTextFile(raw, `${base}.gcam.json`, 'application/json');
    return `${base}.gcam.json`;
}

export async function readProjectFile(file: File): Promise<ProjectSnapshot> {
    return deserializeProject(await file.text());
}

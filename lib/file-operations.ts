import { readFileSync, writeFileSync, existsSync } from 'fs';

export function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error reading ${path}:`, error);
    return null;
  }
}

export function writeJsonFile<T>(path: string, data: T): void {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${path}:`, error);
    throw error;
  }
}

export function ensureFile<T>(path: string, defaultContent: T): T {
  if (!existsSync(path)) {
    writeJsonFile(path, defaultContent);
    return defaultContent;
  }
  return readJsonFile<T>(path) || defaultContent;
}
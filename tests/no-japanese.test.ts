import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());

/** Hiragana, katakana and half-width katakana. CJK ideographs are not flagged. */
const KANA = /[\u3040-\u30FF\uFF66-\uFF9D]/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '素材', '.worktrees', 'generated', '__pycache__']);
const TEXT_EXT = new Set(['.ts', '.js', '.mjs', '.vue', '.json', '.md', '.html', '.css', '.txt', '.py', '.yml', '.yaml']);

/**
 * The only Japanese text allowed to stay: third-party attribution and real on-disk
 * asset paths. Renaming either would misstate authorship or break the asset pipeline.
 */
const ALLOWED_LINE = [/水色の描/, /MMD・VRoidモデル利用規約/, /素材\//];
/** VRM bone node names must match the model; they are technical identifiers, not UI text. */
const ALLOWED_FILES = new Set(['src/frontend/scene-character-assets.ts']);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of ['src', 'scripts', 'integration', 'assets', 'tests']) {
    walk(join(root, dir), files);
  }
  for (const file of ['README.md', 'CODEX.md', 'DeepSeek.md', 'package.json', 'index.html']) {
    files.push(join(root, file));
  }
  // Standalone demos are shipped to the user; only the top level is hand-maintained.
  for (const entry of readdirSync(join(root, 'outputs'))) {
    if (entry.endsWith('.html')) files.push(join(root, 'outputs', entry));
  }
  return files.filter(file => TEXT_EXT.has(file.slice(file.lastIndexOf('.'))));
}

describe('project text stays free of Japanese', () => {
  it('contains no kana in source, docs or shipped demos', () => {
    const violations: string[] = [];
    for (const file of collectFiles()) {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (ALLOWED_FILES.has(rel)) continue;
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!KANA.test(line)) return;
        if (ALLOWED_LINE.some(pattern => pattern.test(line))) return;
        violations.push(`${rel}:${index + 1}: ${line.trim().slice(0, 160)}`);
      });
    }
    expect(violations, `发现日文假名，请改写为中文译名：\n${violations.join('\n')}`).toEqual([]);
  });
});

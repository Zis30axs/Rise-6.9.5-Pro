"""Prepare a scoped Git patch without changing the worktree or index."""
from pathlib import Path
import difflib
import hashlib
import json
import re
import subprocess

root = Path.cwd()
out = root / 'outputs/graphics-recovery/debug'
def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8')
assert git('branch', '--show-current').strip() == 'lite'
assert not git('diff', '--cached', '--name-only').strip(), 'Other staged work exists'
base = git('rev-parse', 'HEAD').strip()
report = json.loads((out.parent / 'verification.json').read_text(encoding='utf-8'))
shared = {'src/frontend/App.vue', 'src/frontend/WorldPanels.vue', 'src/frontend/shell-viewport.css'}
files = list(report['sourceSha256']) + ['scripts/build_graphics_recovery_release.py', 'integration/graphics-recovery/README.md', 'outputs/graphics-recovery/verification.json']
patches = []
expected = {}
working = {}
def replace_once(text, before, after):
    assert text.count(before) == 1, before
    return text.replace(before, after, 1)
for name in files:
    path = root / name
    current = path.read_text(encoding='utf-8')
    working[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    if name in report['sourceSha256'] and name not in shared:
        assert working[name] == report['sourceSha256'][name], f'Changed since validation: {name}'
    tracked = subprocess.run(['git', 'cat-file', '-e', f'HEAD:{name}'], capture_output=True).returncode == 0
    before = git('show', f'HEAD:{name}') if tracked else ''
    after = current
    if name == 'src/frontend/App.vue':
        after = replace_once(before, 'const presentationMode = ref<PresentationMode>(readPresentationMode());\n',
            'const presentationMode = ref<PresentationMode>(readPresentationMode());\nconst graphicsRevision = ref(0);\n')
        for tag in ['<NovelInvitationPortraits v-if="visibleInvitationStage"', '<SoyoLive2D v-if="novelMode"']:
            after = replace_once(after, tag + '\n', tag + '\n      :refresh-token="graphicsRevision"\n')
        button = re.search(r'<button v-if="novelMode" class="graphics-refresh-button".*?</button>', current).group()
        after = replace_once(after, '<div class="host-actions">', '<div class="host-actions">' + button)
        after = replace_once(after, '<WorldPanels :panel="activeWindow" :model="model" :actions="actions" :novel-mode="novelMode"',
            '<WorldPanels :panel="activeWindow" :model="model" :actions="actions" :novel-mode="novelMode" :refresh-token="graphicsRevision"')
        assert 'onShellWheel' not in after and "'decisions'" not in after
    elif name == 'src/frontend/WorldPanels.vue':
        after = replace_once(before, 'novelMode?: boolean }>();', 'novelMode?: boolean; refreshToken?: number }>();')
        after = replace_once(after, '<WorldMap :model="model" :actions="actions" :novel-mode="novelMode"',
            '<WorldMap :model="model" :actions="actions" :novel-mode="novelMode" :refresh-token="refreshToken"')
        assert 'DecisionsPanel' not in after
    elif name == 'src/frontend/shell-viewport.css':
        # Existing desktop scrolling work belongs to the other task.
        unrelated = """@media(min-width:761px) {
  :host([data-uc-viewport]) .floating-window:not(.phone-window) {
    max-height:calc(var(--uc-viewport-height,100dvh) - 120px);
  }
  :host([data-uc-viewport]) .floating-window:not(.phone-window) .window-content {
    min-height:0; overflow-y:auto; overscroll-behavior:contain;
  }
}
"""
        after = replace_once(current, unrelated, '')
    assert after != before, f'No changes: {name}'
    diff = ''.join(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile=f'a/{name}' if tracked else '/dev/null', tofile=f'b/{name}'))
    patches.append(f'diff --git a/{name} b/{name}\n' + ('' if tracked else 'new file mode 100644\n') + diff)
    expected[name] = hashlib.sha256(after.encode('utf-8')).hexdigest()
(out / 'graphics-only.patch').write_text(''.join(patches), encoding='utf-8', newline='\n')
(out / 'commit-scope.json').write_text(json.dumps({'base':base, 'stagedTextSha256':expected, 'workingSha256':working}, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'base':base, 'files':len(files), 'partialFiles':sorted(shared)}, indent=2))

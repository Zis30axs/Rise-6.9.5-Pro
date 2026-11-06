#!/usr/bin/env python3
"""Idempotently wire exactly two existing App.vue props; refuse changed context."""
from pathlib import Path


def prop_already_wired(text: str, tag: str, marker: str) -> bool:
    lines = text.splitlines()
    hits = 0
    for index, line in enumerate(lines):
        if tag not in line:
            continue
        if marker in '\n'.join(lines[index:index + 4]):
            hits += 1
    return hits == 1


def wire(text: str) -> str:
    replacements = [
        ('<NovelBackdrop v-if="novelMode" :location-id="model.state.locationId" :hour="model.state.clock.hour" />',
         '<NovelBackdrop v-if="novelMode" :location-id="model.state.locationId" :hour="model.state.clock.hour" :scene="model.state.scene" />',
         '<NovelBackdrop ', ':scene="model.state.scene"'),
        ('<NovelNpcPortrait v-if="novelMode || encounterPerson" :portrait-id="npcPortraitId" :speaker="portraitLabel" :emotion="novelSegment.emotion" :active="!activeWindow" />',
         '<NovelNpcPortrait v-if="novelMode || encounterPerson" :portrait-id="npcPortraitId" :speaker="portraitLabel" :emotion="novelSegment.emotion" :active="!activeWindow" :location-id="model.state.locationId" />',
         '<NovelNpcPortrait ', ':location-id="model.state.locationId"'),
    ]
    result = text
    for old, new, tag, marker in replacements:
        if result.count(new) == 1 and old not in result:
            continue
        # Later novel markup already passes the same prop, sometimes on the next line.
        if old not in result and new not in result and prop_already_wired(result, tag, marker):
            continue
        if result.count(old) != 1 or new in result:
            raise ValueError('App.vue changed concurrently; inspect before wiring artwork')
        result = result.replace(old, new, 1)
    return result


if __name__ == '__main__':
    path = Path(__file__).resolve().parents[1] / 'src/frontend/App.vue'
    before = path.read_text(encoding='utf-8')
    after = wire(before)
    if after != before:
        path.write_text(after, encoding='utf-8')
    print('App.vue: house-entrance and outfit context wired; no world-state fields changed.')

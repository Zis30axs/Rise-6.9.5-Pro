# Downtown art integration

PR #6 only. Do not merge PR #4 or overwrite other Work changes.

This checkpoint makes the previously-created Git blobs reachable from the PR.
It adds the 2-outfit x 6-expression policy, required 18-asset manifest, and a
fail-closed asset/embedded-PNG validator. This is not yet installed runtime art.
The manifest deliberately remains pending; no new PNG or visual acceptance is
claimed. The existing city/house/worldbook/transit implementation is unchanged.

Run:

```
node --experimental-strip-types --test tests/sakiko-art-policy.node.mjs
python -m unittest discover -s tests -p test_downtown_art_gate.py -v
python scripts/verify_downtown_art.py --root assets/downtown-art --manifest integration/downtown-art/manifest.json --card dist/unread-city-downtown-tt-final.png
```

The release command must fail while art is missing/unreviewed. Tests use synthetic
fixtures; they do not approve generated art. Actual runtime images must have
verified hashes, consistent canvas/anchors, transparent portrait backgrounds,
and actual encoded bytes in the new PNG. Final Tauri PNG must be strictly below
50,000,000 bytes. Passing size or a manifest alone does not prove UI wiring.

The generated concept boards are previews, not twelve independent sprites. Their
printed file sizes and PR labels are not repository or build evidence. Preserve
existing phone functionality and save data. Four viewport tests (1440x900,
1280x800,390x844,320x568) and physical TauriTavern checks remain separate.

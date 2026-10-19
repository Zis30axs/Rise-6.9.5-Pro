# Independent Tauri PNG parser fixture

`upstream_png_metadata.rs` is the unchanged TauriTavern `v2.3.0` file
`src-tauri/crates/tt-adapter-storage-core/src/png_metadata.rs`, commit
`a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375`.
SHA-256: `05c174398166ab14dd9040a4317fa9d172c806e7a90995a7bb7455cb8e3a1f41`.
The downloaded `main` commit `f6126b4fc9243eb3990f2c0bad86e2afcb502f22`
has identical file bytes. Only the external `DomainError` type is stubbed.

From the repository root:

```powershell
cargo run --offline --release --manifest-path outputs/tauri-import-rust-audit/Cargo.toml -- 'D:\.study\cc\outputs\未读之城-远程加载优化版.png' 'D:\.study\cc\outputs\未读之城-Tauri导入压缩版.png' 'D:\.study\cc\outputs\tauri-import-rust-results.json'
```

This calls the actual upstream core parser with both File and Cursor readers,
decodes valid base64 using cached `base64 0.13.1` (not the complete upstream
wrapper), and compares raw decoded JSON. `image 0.25.10` / `png 0.18.1` match
the upstream lock. PNG decoding and Triangle resize/JPEG encoding exercise
the image operations used by the upstream thumbnail path. This harness does
not run Tauri, its importer, staging, filesystem repositories, or mobile UI.
It does not write either card, the deployed bundle, or installed ST data.

`target/` is locally ignored; the small source and lockfile permit rerunning.

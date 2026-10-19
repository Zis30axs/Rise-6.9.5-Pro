// Execute the unmodified upstream core parser, with only its error type stubbed.
extern crate self as tt_domain;
pub mod errors {
    #[derive(Debug)]
    pub enum DomainError { InvalidData(String), InternalError(String) }
}
#[allow(dead_code)]
mod upstream {
    include!("../upstream_png_metadata.rs");
}
use std::{fs, io::Cursor, path::Path, time::Instant};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType};
use serde_json::json;

fn check(path: &Path) -> (Vec<u8>, Vec<u8>, serde_json::Value) {
    let now = Instant::now();
    let bytes = fs::read(path).expect("read card");
    let streamed = upstream::read_preferred_text_chunk(fs::File::open(path).unwrap(), &["ccv3", "chara"]).expect("streaming upstream parser").expect("character chunk");
    let in_memory = upstream::read_preferred_text_chunk(Cursor::new(&bytes), &["ccv3", "chara"]).expect("memory upstream parser").expect("character chunk");
    assert_eq!(streamed, in_memory);
    assert_eq!(streamed.keyword, "chara");
    let decoded = base64::decode(streamed.text.trim()).expect("strict base64 decode");
    let decoded_string = std::str::from_utf8(&decoded).expect("UTF8 JSON");
    let card: serde_json::Value = serde_json::from_str(decoded_string).expect("valid JSON");
    assert_eq!(card["spec"], "chara_card_v2");
    let metadata_ms = now.elapsed().as_millis();
    let source_image = image::load_from_memory(&bytes).expect("image 0.25.10 actual PNG decode");
    let rgba = source_image.to_rgba8().into_raw();
    // Same operations as the upstream thumbnail path: image load, Triangle resize,
    // then JPEG encode. Test both resize branches without calling the application.
    let mut jpeg_sizes = Vec::new();
    for thumbnail in [source_image.resize_to_fill(96, 144, FilterType::Triangle), source_image.resize(96, 144, FilterType::Triangle)] {
        let mut encoded = Vec::new();
        JpegEncoder::new_with_quality(&mut encoded, 95).encode_image(&thumbnail).expect("upstream thumbnail JPEG encode");
        image::load_from_memory(&encoded).expect("thumbnail decode");
        jpeg_sizes.push(encoded.len());
    }
    let report = json!({
        "file": path.to_string_lossy(), "bytes": bytes.len(), "selectedKeyword": streamed.keyword,
        "metadataTextBytes": streamed.text.len(), "decodedJsonBytes": decoded.len(),
        "streamingAndMemoryEqual": true, "metadataMillis": metadata_ms,
        "imageDecodePassed": true, "imageDimensions": [source_image.width(), source_image.height()],
        "thumbnailCoverAndResizeJpegBytes": jpeg_sizes,
        "elapsedMillis": now.elapsed().as_millis()
    });
    (decoded, rgba, report)
}
fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 3, "source derivative report");
    let (before_json, before_rgba, before) = check(Path::new(&args[0]));
    let (after_json, after_rgba, after) = check(Path::new(&args[1]));
    assert_eq!(before_json, after_json, "JSON raw bytes unchanged");
    assert_eq!(before_rgba, after_rgba, "cover RGBA bytes unchanged");
    let report = json!({"source": before, "derivative": after, "decodedJsonByteIdentical": true, "coverRgbaByteIdentical": true, "actualUpstreamCoreParser": true, "tauriApplicationImportTested": false, "note": "Unmodified v2.3.0 upstream png_metadata.rs; DomainError stub only. Base64 decode uses cached 0.13.1 API; image 0.25.10 and png 0.18.1 match upstream lock. No Tauri application or mobile device execution."});
    fs::write(&args[2], serde_json::to_vec_pretty(&report).unwrap()).expect("report");
    println!("actual upstream parser, image decode, JPEG thumbnails, raw JSON and RGBA equality: PASS");
}

"""Offline import of the four exact user-provided archives; never execute contents.

Run with Python + Pillow + numpy + py7zr, followed by prepare_character_models.mjs.
The temporary folder is explicitly supplied, originals are never modified.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import struct
import zipfile

import numpy as np
from PIL import Image

SOURCES = [
    ('soyo', 'soyo_by_jvjiang_5286b1d1c646ade8f33983104074cd9c.zip', '1683a9db7c08309e2e86d0f2c65c3e2dc717420e907effed1594c1c1173f0fba'),
    ('deepseek', 'deepseek蓝色大肥鱼（少女版本）_by_QCQKK_8ed7c5b3227a09952f2a58212253fe9e.zip', '238035bd3400a6e1a530dd2854215975c10dc767290dba57e3301ee550ff3d0c'),
    ('xiaoyang', '小洋学生服2026 (1)_by_蜂神扇_6a4a43ed0269fc66409bdc583e436240.zip', 'd201de947c499e7492120fd17dfff99a3570643379f5496caf7d56227fc937aa'),
    ('claude', 'Claude｜成年·幼年3D角色模型【Blender+GLB】_by_Manny0517_550ec3162a07141f687b92ee744c3c22.zip', '6bdf24e6986bc36c1b5f9401acdec9d295720344f866aac1f1f7154f87717578'),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(root, name):
    name = name.replace('\\', '/')
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or ':' in name or '\x00' in name:
        raise ValueError('Unsafe archive or texture path')
    dest = (root / Path(*p.parts)).resolve()
    if not dest.is_relative_to(root.resolve()):
        raise ValueError('Path escapes input directory')
    return dest


def extract(source, target):
    target.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            if sum(i.file_size for i in archive.infolist()) > 512 * 1024**2:
                raise ValueError('Archive size limit')
            for info in archive.infolist():
                path = safe_path(target, info.filename)
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Archive symlink rejected')
                if info.is_dir():
                    continue
                # Blend files and any executables/scripts remain in the archive.
                if path.suffix.lower() not in {'.pmx', '.vrm', '.glb', '.png', '.jpg', '.jpeg', '.bmp', '.txt', '.md', '.json'} and path.name != 'LICENSE':
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as handle:
                    path.write_bytes(handle.read())
    else:
        import py7zr
        with py7zr.SevenZipFile(source) as archive:
            entries = archive.list()
            if sum(i.uncompressed for i in entries) > 512 * 1024**2:
                raise ValueError('Archive size limit')
            # The known 7z is one VRM; strict membership avoids links and extras.
            if len(entries) != 1 or entries[0].filename != 'DS.vrm' or entries[0].is_directory:
                raise ValueError('Unexpected 7z members')
            safe_path(target, entries[0].filename)
            archive.extract(path=target, targets=['DS.vrm'])


class GlbWriter:
    def __init__(self, data=None):
        self.data = data or {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [], 'meshes': [], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
        self.data.update({'accessors': [], 'bufferViews': [], 'buffers': [{'byteLength': 0}]})
        self.binary = bytearray()

    def view(self, raw, target=None):
        self.binary.extend(b'\x00' * (-len(self.binary) % 4))
        result = len(self.data['bufferViews'])
        view = {'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(raw)}
        if target:
            view['target'] = target
        self.data['bufferViews'].append(view)
        self.binary.extend(raw)
        return result

    def accessor(self, arr, kind, component, bounds=False, target=34962):
        arr = np.asarray(arr)
        widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
        spec = {'bufferView': self.view(arr.tobytes(), target), 'componentType': component, 'type': kind, 'count': int(arr.size / widths[kind])}
        if bounds:
            rows = arr.reshape(-1, widths[kind])
            spec.update(min=rows.min(axis=0).tolist(), max=rows.max(axis=0).tolist())
        self.data['accessors'].append(spec)
        return len(self.data['accessors']) - 1

    def save(self, path):
        self.data['buffers'][0]['byteLength'] = len(self.binary)
        raw = json.dumps(self.data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
        raw += b' ' * (-len(raw) % 4)
        binary = bytes(self.binary) + b'\x00' * (-len(self.binary) % 4)
        path.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(raw) + len(binary)) + struct.pack('<II', len(raw), 0x4E4F534A) + raw + struct.pack('<II', len(binary), 0x004E4942) + binary)


def texture(raw, size=512):
    with Image.open(io.BytesIO(raw)) as source:
        if source.width * source.height > 64_000_000:
            raise ValueError('Texture dimension limit')
        im = source.convert('RGBA')
        im.thumbnail((size, size), Image.Resampling.LANCZOS)
        alpha = im.getextrema()[3][0] < 255
        out = io.BytesIO()
        if alpha:
            im.save(out, format='PNG', optimize=True)
        else:
            im.convert('RGB').save(out, format='JPEG', quality=87, optimize=True)
        return out.getvalue(), 'image/png' if alpha else 'image/jpeg', list(im.size), alpha


class PmxReader:
    def __init__(self, raw):
        self.raw, self.offset = raw, 0

    def get(self, fmt):
        size = struct.calcsize('<' + fmt)
        if self.offset + size > len(self.raw):
            raise ValueError('Truncated PMX')
        values = struct.unpack_from('<' + fmt, self.raw, self.offset)
        self.offset += size
        return values[0] if len(values) == 1 else list(values)

    def skip(self, count):
        self.offset += count
        if self.offset > len(self.raw):
            raise ValueError('Truncated PMX')

    def text(self):
        count = self.get('i')
        if count < 0 or count > 1_000_000 or self.offset + count > len(self.raw):
            raise ValueError('Invalid PMX string length')
        data = self.raw[self.offset:self.offset + count]
        self.skip(count)
        return data.decode(self.encoding)

    def idx(self, width, unsigned=False):
        return self.get(({1: 'B', 2: 'H', 4: 'I'} if unsigned else {1: 'b', 2: 'h', 4: 'i'})[width])

    def count(self):
        number = self.get('i')
        if number < 0 or number > 2_000_000:
            raise ValueError('Invalid PMX count')
        return number


def pmx_glb(source, destination):
    raw = source.read_bytes()
    r = PmxReader(raw)
    if r.get('4s') != b'PMX ' or r.get('f') not in (2.0, np.float32(2.1)):
        raise ValueError('Unsupported PMX')
    if r.get('B') != 8:
        raise ValueError('Unsupported PMX header')
    encoding, extra_uv, vertex_index, texture_index, material_index, bone_index, morph_index, rigid_index = r.get('8B')
    r.encoding = 'utf-16-le' if encoding == 0 else 'utf8'
    name, english, comment, comment_english = (r.text() for _ in range(4))
    count = r.count()
    pos, normal, uv = np.empty((count, 3), '<f4'), np.empty((count, 3), '<f4'), np.empty((count, 2), '<f4')
    joints, weights = np.zeros((count, 4), '<u2'), np.zeros((count, 4), '<f4')
    for i in range(count):
        pos[i], normal[i], uv[i] = r.get('3f'), r.get('3f'), r.get('2f')
        r.skip(extra_uv * 16)
        kind = r.get('B')
        if kind == 0:
            joints[i, 0] = max(0, r.idx(bone_index)); weights[i, 0] = 1
        elif kind in (1, 3):
            joints[i, :2] = [max(0, r.idx(bone_index)) for _ in range(2)]
            weights[i, 0] = r.get('f'); weights[i, 1] = 1 - weights[i, 0]
            if kind == 3:
                r.skip(36)  # SDEF converted to standard linear skinning.
        elif kind in (2, 4):
            joints[i] = [max(0, r.idx(bone_index)) for _ in range(4)]
            weights[i] = r.get('4f')
        else:
            raise ValueError('Unsupported PMX deformation')
        r.skip(4)
    indices = np.array([r.idx(vertex_index, True) for _ in range(r.count())], '<u4').reshape(-1, 3)
    indices = indices[:, [0, 2, 1]].ravel().copy()
    pos[:, 2] *= -1; normal[:, 2] *= -1
    textures = [r.text() for _ in range(r.count())]
    materials = []
    for _ in range(r.count()):
        label, label_en, diffuse = r.text(), r.text(), r.get('4f')
        r.skip(28)
        flags = r.get('B'); r.skip(20)
        tex, sphere = r.idx(texture_index), r.idx(texture_index)
        r.skip(1)
        shared_toon = r.get('B'); r.skip(1 if shared_toon else texture_index)
        note, faces = r.text(), r.get('i')
        materials.append({'name': label, 'diffuse': diffuse, 'texture': tex, 'faces': faces, 'flags': flags})
    bones = []
    for _ in range(r.count()):
        label, label_en, position = r.text(), r.text(), r.get('3f')
        parent = r.idx(bone_index); r.skip(4); flags = r.get('H')
        r.skip(bone_index if flags & 1 else 12)
        if flags & 0x300: r.skip(bone_index + 4)
        if flags & 0x400: r.skip(12)
        if flags & 0x800: r.skip(24)
        if flags & 0x2000: r.skip(4)
        if flags & 0x20:
            r.skip(bone_index + 8)
            for _ in range(r.count()):
                r.skip(bone_index)
                if r.get('B'): r.skip(24)
        position[2] *= -1
        bones.append({'name': label, 'english': label_en, 'position': position, 'parent': parent})
    if joints.max() >= len(bones) or indices.max() >= count or not np.isfinite(pos).all():
        raise ValueError('Invalid PMX geometry indices')
    out = GlbWriter()
    out.data['asset'].update(generator='Unread City PMX importer', extras={'sourceName': name, 'sourceSha256': digest(raw), 'sourceComment': comment, 'sourceEnglishComment': comment_english, 'upAxis': '+Y', 'forwardAxis': '+Z'})
    out.data['nodes'] = [{'name': 'SoyoRoot', 'children': [1] + [i + 2 for i, b in enumerate(bones) if b['parent'] < 0]}, {'name': 'SoyoMesh', 'mesh': 0, 'skin': 0}]
    for i, bone in enumerate(bones):
        parent = bone['parent']
        if parent >= len(bones) or parent == i: raise ValueError('Invalid bone parent')
        local = np.array(bone['position']) - (np.array(bones[parent]['position']) if parent >= 0 else 0)
        node = {'name': bone['name'], 'translation': local.tolist(), 'extras': {'englishName': bone['english']}}
        children = [j + 2 for j, b in enumerate(bones) if b['parent'] == i]
        if children: node['children'] = children
        # Standard MMD arm axes are world-aligned. Lower the original A-pose.
        if bone['name'] in ('左腕', '右腕'):
            angle = math.radians(-43 if bone['position'][0] > 0 else 43)
            node['rotation'] = [0, 0, math.sin(angle / 2), math.cos(angle / 2)]
        out.data['nodes'].append(node)
    inv = np.repeat(np.eye(4, dtype='<f4')[None], len(bones), axis=0)
    inv[:, :3, 3] = -np.array([b['position'] for b in bones])
    out.data['skins'] = [{'name': 'Soyo skeleton', 'joints': list(range(2, len(bones) + 2)), 'inverseBindMatrices': out.accessor(inv.transpose(0, 2, 1).copy(), 'MAT4', 5126, target=None)}]
    attributes = {'POSITION': out.accessor(pos, 'VEC3', 5126, True), 'NORMAL': out.accessor(normal, 'VEC3', 5126), 'TEXCOORD_0': out.accessor(uv, 'VEC2', 5126), 'JOINTS_0': out.accessor(joints, 'VEC4', 5123), 'WEIGHTS_0': out.accessor(weights, 'VEC4', 5126)}
    image_cache, primitives, start = {}, [], 0
    for material in materials:
        pbr = {'baseColorFactor': [min(1, max(0, value)) for value in material['diffuse']], 'metallicFactor': 0, 'roughnessFactor': 0.9}
        mat = {'name': material['name'], 'doubleSided': bool(material['flags'] & 1), 'pbrMetallicRoughness': pbr, 'extensions': {'KHR_materials_unlit': {}}}
        if material['diffuse'][3] < 1: mat['alphaMode'] = 'BLEND'
        ti = material['texture']
        if ti >= 0:
            if ti not in image_cache:
                tex_path = safe_path(source.parent, textures[ti])
                data, mime, dims, alpha = texture(tex_path.read_bytes())
                image_id = len(out.data['images']); image_cache[ti] = (image_id, alpha)
                out.data['images'].append({'bufferView': out.view(data), 'mimeType': mime, 'name': Path(textures[ti]).name})
                out.data['textures'].append({'source': image_id, 'sampler': 0})
            texture_id, alpha = image_cache[ti]
            pbr['baseColorTexture'] = {'index': texture_id}
            if alpha and mat.get('alphaMode') != 'BLEND':
                mat.update(alphaMode='MASK', alphaCutoff=0.35)
        out.data['materials'].append(mat)
        end = start + material['faces']
        if end > len(indices): raise ValueError('Invalid PMX material range')
        if end > start:
            primitives.append({'attributes': attributes, 'indices': out.accessor(indices[start:end], 'SCALAR', 5125, target=34963), 'material': len(out.data['materials']) - 1})
        start = end
    if start != len(indices): raise ValueError('PMX material ranges mismatch')
    out.data['extensionsUsed'] = ['KHR_materials_unlit']
    out.data['meshes'] = [{'name': name, 'primitives': primitives}]
    out.save(destination)
    return {'vertices': count, 'triangles': len(indices) // 3, 'bones': len(bones), 'sourceName': name, 'sourceComments': [comment, comment_english], 'bonesInfo': bones, 'originalMorphsDropped': True}


def parse_glb(raw):
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw): raise ValueError('Invalid GLB header')
    length, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4E4F534A: raise ValueError('Missing GLB JSON')
    data = json.loads(raw[20:20 + length])
    blen, bkind = struct.unpack_from('<II', raw, 20 + length)
    binary = raw[28 + length:]
    if bkind != 0x004E4942 or blen != len(binary) or len(data['buffers']) != 1: raise ValueError('Invalid GLB buffer')
    if any('uri' in item for item in data['buffers'] + data.get('images', [])): raise ValueError('External URI rejected')
    return data, binary


def clean_glb(source, destination, model_id):
    raw = source.read_bytes()
    data, binary = parse_glb(raw)
    report = {'vertices': sum(data['accessors'][p['attributes']['POSITION']]['count'] for m in data['meshes'] for p in m['primitives']), 'triangles': sum(data['accessors'][p['indices']]['count'] // 3 for m in data['meshes'] for p in m['primitives']), 'bones': len(set(j for s in data.get('skins', []) for j in s['joints'])), 'skins': len(data.get('skins', [])), 'sourceAsset': data['asset'], 'sourceVrmMeta': data.get('extensions', {}).get('VRM', {}).get('meta'), 'humanoid': data.get('extensions', {}).get('VRM', {}).get('humanoid', {}).get('humanBones'), 'originalMorphsDropped': True}
    # Extract packed diffuse images; nodes/skin accessors stay intact for the next step.
    data['asset']['extras'] = {'sourceSha256': digest(raw), 'upAxis': '+Y', 'sourceFormat': source.suffix, 'sourceVrmMeta': report['sourceVrmMeta']}
    data.pop('extensions', None); data.pop('animations', None)
    data.pop('extensionsRequired', None); data['extensionsUsed'] = ['KHR_materials_unlit'] if model_id != 'claude' else []
    for node in data.get('nodes', []):
        node.pop('extensions', None); node.pop('weights', None)
    for mesh in data['meshes']:
        mesh.pop('weights', None); mesh.pop('extras', None)
        for primitive in mesh['primitives']: primitive.pop('targets', None)
    # Keep only diffuse colour, alpha and original material-sidedness.
    new_images, new_textures, images = [], [], {}
    for mat in data['materials']:
        pbr = mat.get('pbrMetallicRoughness', {})
        info = pbr.get('baseColorTexture')
        new_pbr = {'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]), 'metallicFactor': 0, 'roughnessFactor': 0.88}
        if info:
            original = data['textures'][info['index']]['source']
            if original not in images:
                image = data['images'][original]; view = data['bufferViews'][image['bufferView']]
                offset, size = view.get('byteOffset', 0), view['byteLength']
                if offset < 0 or offset + size > len(binary): raise ValueError('Invalid image buffer')
                # The scan-derived Claude face needs its original 2048px atlas;
                # smaller atlases blur the eyes and leak across tiny UV islands.
                encoded, mime, dims, alpha = texture(binary[offset:offset + size], 512 if model_id != 'claude' else 2048)
                pad = -len(binary) % 4; binary += b'\0' * pad
                view_id = len(data['bufferViews'])
                data['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(encoded)})
                binary += encoded
                idx = len(new_images); images[original] = idx
                new_images.append({'bufferView': view_id, 'mimeType': mime, 'name': image.get('name', str(original))})
                new_textures.append({'source': idx, 'sampler': 0})
            transform = info.get('extensions', {}).get('KHR_texture_transform', {})
            if transform.get('offset', [0, 0]) != [0, 0] or transform.get('scale', [1, 1]) != [1, 1] or transform.get('rotation', 0):
                raise ValueError('Nonidentity texture transform requires explicit support')
            new_pbr['baseColorTexture'] = {'index': images[original], 'texCoord': info.get('texCoord', 0)}
        keep = {key: mat[key] for key in ('name', 'alphaMode', 'alphaCutoff', 'doubleSided') if key in mat}
        mat.clear(); mat.update(keep); mat['pbrMetallicRoughness'] = new_pbr
        if model_id != 'claude': mat['extensions'] = {'KHR_materials_unlit': {}}
    data['images'], data['textures'], data['samplers'] = new_images, new_textures, [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    out = GlbWriter()
    out.data, out.binary = data, bytearray(binary)
    out.save(destination)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory', type=Path)
    parser.add_argument('temporary_directory', type=Path)
    args = parser.parse_args()
    args.temporary_directory.mkdir(parents=True, exist_ok=True)
    records = []
    for model_id, name, expected in SOURCES:
        archive = args.source_directory / name
        archive_bytes = archive.read_bytes()
        if digest(archive_bytes) != expected: raise ValueError(f'Input archive changed: {name}')
        target = args.temporary_directory / model_id
        extract(archive, target)
        models = [p for p in target.rglob('*') if p.suffix.lower() in {'.pmx', '.vrm', '.glb'}]
        if len(models) != 1: raise ValueError('Expected exactly one usable source model')
        source = models[0]
        destination = args.temporary_directory / (model_id + '.glb')
        record = pmx_glb(source, destination) if source.suffix == '.pmx' else clean_glb(source, destination, model_id)
        record.update(id=model_id, archive=name, archiveSha256=expected, archiveBytes=len(archive_bytes), sourceModel=source.relative_to(target).as_posix(), sourceModelBytes=source.stat().st_size, sourceSha256=digest(source.read_bytes()))
        records.append(record)
        print(f'{model_id}: {record["triangles"]} triangles, {record["bones"]} bones; prepared', flush=True)
    (args.temporary_directory / 'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()

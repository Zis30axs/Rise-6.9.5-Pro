"""Run from the repo root: blender -b -P scripts/build_toyokawa_tower.py"""
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def material(name, color, metallic=0, roughness=.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    return mat

stone = material('Warm limestone', (.67, .60, .47))
steel = material('Dark mullions', (.038, .054, .063), .55)
glass = material('Blue grey curtain wall', (.12, .25, .30), .53, .26)
brass = material('Aged brass', (.55, .33, .12), .68, .32)
walnut = material('Oiled walnut', (.27, .125, .061))
plaster = material('Ivory plaster', (.85, .79, .66))
wool = material('River blue wool', (.082, .17, .19))
leather = material('Cognac leather', (.38, .18, .084))
linen = material('Book linen', (.58, .60, .51))
leaves = material('Foliage', (.09, .22, .12))
models = []

def box(name, center, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Rounded edges', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    models.append(obj)
    return obj

# The canopy faces local -Y. The street door is 8 m south of the origin.
box('Forecourt', (0, -.75, .10), (21, 15, .2), stone)
box('Plinth', (0, 0, 1.9), (18, 11.8, 3.6), stone)
box('Entrance glazing', (0, -5.94, 1.65), (6, .12, 2.9), glass)
for x in (-3, -.72, .72, 3):
    box('Entrance jamb', (x, -6.08, 1.6), (.11, .22, 2.9), brass)
box('Main entrance canopy', (0, -6.55, 3.15), (8.3, 2.6, .26), brass)
for x in (-7.6, 7.6):
    box('Raised planter', (x, -6.5, .46), (2.1, 1.65, .65), steel)
    box('Clipped hedge', (x, -6.5, .97), (1.85, 1.36, .64), leaves, .15)
box('Office shaft', (0, 0, 14.25), (15, 9.6, 21), glass)
for floor in range(11):
    box('Floor band', (0, 0, 3.85 + floor * 2.08), (15.28, 9.86, .22), steel)
for x in range(-7, 8, 2):
    for y in (-4.88, 4.88):
        box('Vertical fin', (x, y, 14.25), (.16, .28, 21), brass)
for y in (-3, -1, 1, 3):
    for x in (-7.55, 7.55):
        box('Return fin', (x, y, 14.25), (.21, .12, 21), steel)

# Fitted top floor. Keep the south glazing clear for the view from the salon.
deck = 24.95
def fit(name, x, y, height, width, depth, tall, mat, bevel=0):
    return box(name, (x, y, deck + height), (width, depth, tall), mat, bevel)

fit('Penthouse floor', 0, 0, 0, 15.9, 10.6, .34, walnut)
fit('Parapet cap', 0, 0, 3.86, 15.9, 10.6, .3, stone)
fit('Lift and stair crown', 0, 1, 4.66, 6.6, 4.6, 1.4, steel)
fit('North gallery wall', 0, 4.91, 2, 15.3, .2, 3.75, plaster)
for x in (-7.52, 7.52):
    fit('Side wall', x, 0, 2, .17, 9.85, 3.75, plaster)
for x in (-7.5, -5, -2.5, 0, 2.5, 5, 7.5):
    fit('Panoramic window mullion', x, -4.89, 2, .10, .15, 3.75, brass)
fit('Window sill', 0, -4.9, .40, 15.1, .32, .48, stone)
fit('Woven rug', -.8, -.6, .20, 6.1, 4.7, .07, wool)
def sofa(x, y, direction):
    fit('Sofa plinth', x, y, .40, 2.65, .91, .39, walnut, .04)
    fit('Upholstered bench', x, y, .67, 2.62, .97, .31, leather, .11)
    fit('Sofa back', x, y + direction * .45, .98, 2.62, .22, .70, leather, .10)
    for side in (-1, 1):
        fit('Armrest', x + side * 1.23, y, .83, .18, .90, .40, leather, .07)
sofa(-1, .85, 1)
sofa(-1, -2.13, -1)
fit('Coffee table foot', -1, -.63, .39, 1.55, .58, .36, walnut)
fit('Coffee table slab', -1, -.63, .60, 2.08, .96, .12, stone, .05)
fit('Book on the table', -1.45, -.64, .69, .38, .27, .06, linen)
for x in (3.9, 6):
    fit('Desk pedestal', x, 1.2, .68, .44, .95, 1, walnut)
fit('Chairman desk', 4.95, 1.2, 1.22, 3.25, 1.25, .13, walnut, .04)
for x in (-5.6, -3.6, -1.6):
    fit('Cabinet', x, 4.18, .65, 1.96, .68, .97, walnut, .03)
for i in range(3):
    fit('Framed landscape', -5.7 + i * 1.85, 4.75, 2.45, 1.67, .12, 1.46, brass)
    fit('Lacquer panel', -5.7 + i * 1.85, 4.66, 2.45, 1.52, .09, 1.31, (wool, walnut, linen)[i])
for i in range(12):
    fit('Walnut screen blade', 2.4 + i * .33, 3.62, 1.87, .13, .27, 3.37, walnut)
fit('Private suite door', 6.9, 4.72, 1.46, 1.04, .2, 2.55, walnut)

# Batch by material to keep the portable model light on mobile.
batches = {}
for obj in models:
    batches.setdefault(obj.data.materials[0], []).append(obj)
for mat, parts in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = mat.name
bpy.ops.export_scene.gltf(filepath=str(root / 'assets/models/toyokawa-executive-tower.glb'),
                          export_format='GLB', export_yup=True, export_cameras=False, export_lights=False)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = False
scene.render.resolution_x, scene.render.resolution_y = 1120, 630
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.quality = 88
scene.world = bpy.data.worlds.new('Tokyo sky')
scene.world.use_nodes = True
sky = scene.world.node_tree.nodes.get('Background')
bpy.ops.object.camera_add(location=(6.64, -4.22, deck + 1.87))
camera = bpy.context.object
camera.rotation_euler = (Vector((-.6, .85, deck + 1.43)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 27
scene.camera = camera

def area(name, position, target, width):
    bpy.ops.object.light_add(type='AREA', location=position)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj.data.shape, obj.data.size = 'DISK', width
    return obj.data
window = area('Window light', (0, -6.8, deck+3), (0, 1, deck+1), 9)
lamp = area('Ceiling light', (-1, 1, deck+3.55), (-1, 1, deck), 5)
for phase, strength, fill, ambient, color in [
    ('day', 2100, 330, .65, (1, .88, .72)),
    ('night', 110, 720, .13, (.41, .56, 1)),
]:
    sky.inputs['Color'].default_value = (.65, .76, .92, 1)
    sky.inputs['Strength'].default_value = ambient
    window.energy, window.color = strength, color
    lamp.energy, lamp.color = fill, (1, .73, .48)
    scene.render.filepath = str(root / f'assets/backgrounds/toyokawa-executive-{phase}.webp')
    bpy.ops.render.render(write_still=True)

"""Render player-facing scenic plates from the shipped Paris models."""
from pathlib import Path
import bpy, gzip, tempfile, math
from mathutils import Vector
root=Path(__file__).resolve().parents[1]/'assets/paris-sandbox'
out=root/'backdrops';out.mkdir(exist_ok=True)
city={
'eiffel':((-25,23.5,2.25),(-30,7,10.3),15),
'arc':((-27.6,-14,1.48),(-31,-19,2.6),16),
'louvre':((7,-12.5,1.14),(18,-12.2,1.86),24),
'notre-dame':((25.3,7.6,2.4),(32,1.0,2.8),22),
'invalides':((-1.2,5.9,4.5),(-4,16.6,4.0),21),
'alexandre':((-4,0.5,.47),(-10.5,-3.8,1.20),23)}
airport={'cdg-airport':((-6,12,2.00),(-13,-1,2.6),25),'paris-roissypole':((35.2,16,2.14),(23.8,7.15,1.60),29)}
for model,views in [('sandbox',city),('airport',airport)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 with tempfile.TemporaryDirectory() as tmp:
    path=Path(tmp)/'model.glb';path.write_bytes(gzip.decompress((root/(model+'.glb.gz.bin')).read_bytes()));bpy.ops.import_scene.gltf(filepath=str(path))
 s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False
 s.world=bpy.data.worlds.new('Haze');s.world.use_nodes=True
 n=s.world.node_tree.nodes;links=s.world.node_tree.links
 tex=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');ramp=n.new('ShaderNodeValToRGB')
 links.new(tex.outputs['Generated'],sep.inputs[0]);links.new(sep.outputs['Z'],ramp.inputs[0]);links.new(ramp.outputs['Color'],n['Background'].inputs['Color'])
 ramp.color_ramp.elements[0].color=(.71,.79,.82,1);ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=(.26,.46,.73,1)
 n['Background'].inputs['Strength'].default_value=.87
 def look(o,pt):o.rotation_euler=(Vector(pt)-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.light_add(type='SUN',location=(-28,-50,80));sun=bpy.context.object;look(sun,(0,0,0));sun.data.angle=.12;sun.data.energy=2.15;sun.data.color=(1,.91,.76)
 bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.clip_start=.04
 s.render.resolution_x=940;s.render.resolution_y=524;s.render.resolution_percentage=100;s.render.image_settings.file_format='WEBP';s.render.image_settings.quality=77
 for name,(eye,aim,focal) in views.items():
    x,y,z=eye;cam.location=(x,-y,z);x,y,z=aim;look(cam,(x,-y,z));cam.data.lens=focal
    s.render.filepath=str(out/(name+'.webp'));bpy.ops.render.render(write_still=True)

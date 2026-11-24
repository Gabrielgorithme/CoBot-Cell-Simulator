import sys, trimesh, numpy as np
src = sys.argv[1]; out = sys.argv[2]
parts = [("base","ur10e"),("shoulder","ur10e"),("upperarm","ur16e"),("forearm","ur16e"),("wrist1","ur10e"),("wrist2","ur10e"),("wrist3","ur10e")]
key = {71:"cast", 8:"seal", 125:"cap", 209:"tube"}
scene = trimesh.Scene()
for name, fam in parts:
    s = trimesh.load(f"{src}/meshes/{fam}/visual/{name}.dae", force="scene")
    groups = {}
    for gname, g in s.geometry.items():
        for n in [n for n in s.graph.nodes_geometry if s.graph[n][1] == gname]:
            T, _ = s.graph[n]
            m = trimesh.Trimesh(vertices=g.vertices.copy(), faces=g.faces.copy(), process=False)
            m.apply_transform(T)
            k = key[int(g.visual.material.main_color[0])]
            groups.setdefault(k, []).append(m)
    for k, ms in groups.items():
        m = trimesh.util.concatenate(ms)
        m = trimesh.Trimesh(vertices=m.vertices, faces=m.faces, process=False)
        scene.add_geometry(m, node_name=f"{name}__{k}", geom_name=f"{name}__{k}")
scene.export(out)

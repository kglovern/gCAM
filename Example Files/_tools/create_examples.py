from pathlib import Path
import csv, hashlib, json, math, struct
from collections import Counter
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
entries=[]

def record(path, purpose, dimensions, expected):
    entries.append(dict(file=path.relative_to(ROOT).as_posix(), purpose=purpose, dimensions=dimensions, expected=expected, source='Original mathematical/example data', license='CC0-1.0', sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

def image_file(folder,name,array,purpose,expected,mm='100 x 100 mm; set size during import'):
    p=ROOT/folder/name; p.parent.mkdir(parents=True,exist_ok=True)
    im=Image.fromarray(array); im.save(p)
    with Image.open(p) as check: check.load(); assert check.size==im.size
    record(p,purpose,f'{im.width} x {im.height} px; {mm}',expected)
    return p

N=513
v=np.linspace(-1,1,N); x,y=np.meshgrid(v,v); r=np.hypot(x,y); theta=np.arctan2(y,x)
ramp=np.tile(np.linspace(0,1,N),(N,1))
dome=np.sqrt(np.maximum(0,1-(r/.9)**2))
steps=np.minimum(4,np.floor((x+1)*2.5))/4
flower=np.maximum(0,1-(r/(.67+.18*np.cos(6*theta)))**2)**1.5
flower=np.maximum(.75*flower,.95*np.exp(-((r/.2)**2)))
terrain=.65*np.exp(-(((x+.25)/.43)**2+((y-.1)/.52)**2))+.5*np.exp(-(((x-.45)/.25)**2+((y+.3)/.4)**2))
terrain=np.clip(terrain,0,1)
for name,a,desc in [('01-ramp',ramp,'Linear left-to-right rise: black is low, white is high'),('02-dome',dome,'Smooth dome on a flat black background'),('03-steps',steps,'Five known levels for checking depth mapping'),('04-flower-relief',flower,'Six-petal decorative relief, without lighting or shadows'),('05-terrain',terrain,'Two smooth hills for surface finishing')]:
    image_file('01 Heightmaps',name+'-8bit.png',np.round(a*255).astype('uint8'),desc,'Future heightmap relief import; currently loads as bitmap. Map black to 0 mm and white to 6 mm.')
image_file('01 Heightmaps','06-ramp-16bit.png',np.round(ramp*65535).astype('uint16'),'16-bit linear gradient','Future precision check; 513 distinct source levels, not an 8-bit image in a 16-bit container.')
image_file('01 Heightmaps','07-flower-16bit.tiff',np.round(flower*65535).astype('uint16'),'16-bit TIFF relief','Future TIFF/16-bit import; current browser decoder support is not guaranteed.')
image_file('01 Heightmaps','08-dome-inverted-8bit.bmp',np.round((1-dome)*255).astype('uint8'),'Reversed black/white convention','Future invert-height control; this intentionally becomes a bowl under white-high interpretation.')

# Clean raster artwork is deliberately distinct from a heightmap.
im=Image.new('L',(800,500),255); d=ImageDraw.Draw(im)
d.rounded_rectangle((45,45,755,455),radius=35,outline=0,width=18)
d.ellipse((100,130,300,330),fill=0); d.rectangle((390,135,680,180),fill=0)
d.rectangle((390,230,680,275),fill=0); d.rectangle((390,325,590,370),fill=0)
image_file('02 Bitmaps','01-clean-sign.png',np.asarray(im),'High-contrast sign artwork for tracing','Convert to vector; check closed outlines and holes.','160 x 100 mm suggested')
image_file('02 Bitmaps','02-clean-sign.bmp',np.asarray(im),'BMP equivalent of the tracing artwork','Trace comparison against PNG.','160 x 100 mm suggested')
rgba=Image.new('RGBA',im.size,(255,255,255,0)); rgba.putalpha(ImageOps.invert(im)); rgba.paste((20,20,20), (0,0,800,500), ImageOps.invert(im))
image_file('02 Bitmaps','03-transparent-art.png',np.asarray(rgba),'Transparent-background artwork','Trace must handle alpha without turning transparent space into solid background.','160 x 100 mm suggested')
image_file('02 Bitmaps','04-low-resolution.jpg',np.asarray(im.resize((160,100),Image.Resampling.BILINEAR)),'Small compressed artwork','Check trace cleanup and preview at a useful physical size.','160 x 100 mm suggested')
# A shaded image is NOT height data: useful for teaching the difference.
gy,gx=np.gradient(dome); light=np.clip(.65-gx*20-gy*12,0,1); shaded=np.round(light*255).astype('uint8')
image_file('02 Bitmaps','05-shaded-dome-not-a-heightmap.jpg',shaded,'Shaded illustration: brightness contains lighting, not just elevation','Raster/wavy/halftone example; do not describe this as a valid relief heightmap.')

folder=ROOT/'03 Vectors'; folder.mkdir(exist_ok=True)
svg='''<svg xmlns="http://www.w3.org/2000/svg" width="160mm" height="100mm" viewBox="0 0 160 100"><g fill="none" stroke="black" stroke-width="0.2"><path d="M0 0H160V100H0Z"/><circle cx="25" cy="25" r="8"/><circle cx="135" cy="25" r="8"/><path d="M45 30H115V70H45Z"/><path d="M20 80H140"/></g></svg>'''
p=folder/'01-sign-mm.svg'; p.write_text(svg,encoding='utf8'); record(p,'Outline, two holes, pocket rectangle and open engraving line','160 x 100 mm','Import at 160 x 100 mm; profile closed shapes, engrave the open line.')
p=folder/'02-inch-square.svg'; p.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="2in" viewBox="0 0 2 2"><path d="M0 0H2V2H0Z" fill="none" stroke="black" stroke-width="0.01"/></svg>',encoding='utf8'); record(p,'Inch-unit import check','50.8 x 50.8 mm','Must import as 50.8 mm square, not 2 mm.')
# ASCII DXF with explicit $INSUNITS=4 (mm).
lines=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES']
for a,b in [((0,0),(100,0)),((100,0),(100,60)),((100,60),(0,60)),((0,60),(0,0))]:
    lines+=['0','LINE','8','Outline','10',str(a[0]),'20',str(a[1]),'30','0','11',str(b[0]),'21',str(b[1]),'31','0']
for cx in (20,80): lines+=['0','CIRCLE','8','Holes','10',str(cx),'20','30','30','0','40','5']
lines+=['0','ENDSEC','0','EOF']; p=folder/'03-plate-mm.dxf'; p.write_text('\n'.join(lines)+'\n',encoding='ascii'); record(p,'Simple plate with two holes','100 x 60 mm; holes diameter 10 mm','Check units, outline closure and circular hole import.')

folder=ROOT/'04 Models'; folder.mkdir(exist_ok=True)

def relief_mesh(a,w=100,h=100,base=2,relief=6):
    rows,cols=a.shape; verts=[(i*w/(cols-1),j*h/(rows-1),base+float(a[j,i])*relief) for j in range(rows) for i in range(cols)]
    faces=[]
    for j in range(rows-1):
        for i in range(cols-1):
            k=j*cols+i; faces.extend([(k,k+1,k+cols+1),(k,k+cols+1,k+cols)])
    border=list(range(cols))+[j*cols+cols-1 for j in range(1,rows)]+[(rows-1)*cols+i for i in range(cols-2,-1,-1)]+[j*cols for j in range(rows-2,0,-1)]
    bottom=[]
    for k in border: bottom.append(len(verts)); verts.append((verts[k][0],verts[k][1],0))
    center=len(verts); verts.append((w/2,h/2,0))
    for i,top in enumerate(border):
        ni=(i+1)%len(border); faces.extend([(top,bottom[i],bottom[ni]),(top,bottom[ni],border[ni]),(center,bottom[ni],bottom[i])])
    return np.asarray(verts,dtype=float),faces

def verify_mesh(verts,faces):
    edges=Counter(); directed=Counter()
    for f in faces:
        assert len(set(f))==3
        assert np.linalg.norm(np.cross(verts[f[1]]-verts[f[0]],verts[f[2]]-verts[f[0]]))>1e-10
        for a,b in zip(f,(f[1],f[2],f[0])): edges[tuple(sorted((a,b)))]+=1; directed[(a,b)]+=1
    assert all(n==2 for n in edges.values()), 'Not closed manifold'
    assert all(directed[(b,a)]==n for (a,b),n in directed.items()), 'Inconsistent winding'
    volume=sum(np.dot(verts[a],np.cross(verts[b],verts[c])) for a,b,c in faces)/6
    assert volume>0
    return dict(vertices=len(verts),triangles=len(faces),volume_mm3=round(volume,3),bounds_mm=[verts.min(axis=0).tolist(),verts.max(axis=0).tolist()],closed_manifold=True)

mesh_validation={}
def model(name,verts,faces,fmt,desc,expected):
    stats=verify_mesh(verts,faces); p=folder/(name+'.'+fmt)
    if fmt=='stl':
        with p.open('wb') as f:
            f.write(b'Original example mesh; coordinates intended as millimetres'.ljust(80,b' ')); f.write(struct.pack('<I',len(faces)))
            for inds in faces:
                tri=verts[list(inds)]; n=np.cross(tri[1]-tri[0],tri[2]-tri[0]); n/=np.linalg.norm(n)
                f.write(struct.pack('<12fH',*n,*tri.flatten(),0))
        assert p.stat().st_size==84+50*len(faces)
    elif fmt=='obj':
        p.write_text('# Coordinates intended as millimetres\n'+''.join('v %.8f %.8f %.8f\n'%tuple(v) for v in verts)+''.join('f %d %d %d\n'%tuple(i+1 for i in face) for face in faces),encoding='ascii')
    elif fmt=='ascii.stl':
        text=['solid example']
        for inds in faces:
            tri=verts[list(inds)]; n=np.cross(tri[1]-tri[0],tri[2]-tri[0]); n/=np.linalg.norm(n)
            text+=['facet normal %g %g %g'%tuple(n),'outer loop']+['vertex %.8f %.8f %.8f'%tuple(v) for v in tri]+['endloop','endfacet']
        text+=['endsolid example']; p.write_text('\n'.join(text)+'\n',encoding='ascii')
    mesh_validation[p.name]=stats
    bounds=np.ptp(verts,axis=0)
    record(p,desc,' x '.join(f'{n:g}' for n in bounds)+' mm; STL/OBJ carry no reliable unit metadata',expected)

verts,faces=relief_mesh(dome[::8,::8]); model('01-dome-relief',verts,faces,'stl','Closed dome with 2 mm base and 6 mm relief','Choose mm, Top face, then surface clear and surface finish.')
model('02-dome-relief',verts,faces,'obj','Same geometry in OBJ format','Same physical size and top surface as binary STL.')
verts,faces=relief_mesh(flower[::8,::8]); model('03-flower-relief',verts,faces,'stl','Decorative relief matching heightmap 04','Compare mesh machining with future heightmap machining.')
verts,faces=relief_mesh(steps[::32,::32],80,60); model('04-stepped-relief',verts,faces,'ascii.stl','ASCII STL with terraces and steep transitions','Check ASCII import, waterline finishing and size 80 x 60 x 8 mm.')
# Rotate a closed relief to demand a deliberate setup orientation.
verts,faces=relief_mesh(dome[::16,::16]); verts=verts[:,[0,2,1]]; verts[:,2]*=-1
model('05-relief-standing-on-edge',verts,faces,'stl','Valid mesh stored standing vertically','Choose the correct machining face; do not cut from the default edge view.')
# A full 3D lathe-like mesh, with end caps; long axis is X.
verts=[]; faces=[]; rings=41; sides=64
for i in range(rings):
    xx=i*120/(rings-1); rr=9+5*math.sin(math.pi*i/(rings-1))**2+2*math.sin(4*math.pi*i/(rings-1))**2
    for j in range(sides):
        ang=2*math.pi*j/sides; verts.append((xx,rr*math.cos(ang),rr*math.sin(ang)))
for i in range(rings-1):
    for j in range(sides):
        a=i*sides+j; b=i*sides+(j+1)%sides; c=(i+1)*sides+(j+1)%sides; dd=(i+1)*sides+j
        faces.extend([(a,b,c),(a,c,dd)])
left=len(verts); verts.append((0,0,0)); right=len(verts); verts.append((120,0,0))
for j in range(sides):
    nj=(j+1)%sides; faces.extend([(left,nj,j),(right,(rings-1)*sides+j,(rings-1)*sides+nj)])
rotary_verts=np.asarray(verts)[:,[1,2,0]]
model('06-z-up-spindle',rotary_verts,faces,'stl','Closed Z-up spindle for rotary import','Import in Rotary > STL; expected length 120 mm. A turning silhouette can reproduce this rotational form.')
lobed=rotary_verts.copy()
angles=np.arctan2(lobed[:,1],lobed[:,0]); factors=.82+.18*np.cos(3*angles); lobed[:,:2]*=factors[:,None]
model('07-z-up-lobed-spindle',lobed,faces,'stl','Non-round spindle with three lobes around its circumference','Rotary silhouette import loses the lobes. Compare original mesh preview with the turned envelope; this demonstrates the current limitation.')
(ROOT/'mesh-validation.json').write_text(json.dumps(mesh_validation,indent=2)+'\n')
with (ROOT/'MANIFEST.csv').open('w',newline='',encoding='utf-8-sig') as f:
    writer=csv.DictWriter(f,fieldnames=list(entries[0])); writer.writeheader(); writer.writerows(entries)
(ROOT/'LICENSE.txt').write_text('The original example images, vectors and meshes in this folder are dedicated to the public domain under CC0 1.0 Universal.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nNo third-party decorative model assets are included.\n')
(ROOT/'START HERE.txt').write_text('gCAM example files - 28 October 2026\n\n01 Heightmaps: actual grayscale elevation data, with no baked lighting. Black=low, white=high, except the named inverted example. Suggested size 100 x 100 mm; suggested relief height 6 mm. PNG/TIFF do not define a machining size or Z depth.\n02 Bitmaps: tracing and image-effect examples. The shaded dome is deliberately NOT a heightmap.\n03 Vectors: metric/inch SVG and metric DXF checks.\n04 Models: closed, consistently wound meshes. Choose millimetres at import. The standing model needs orientation; the full spindle is not a single-sided relief.\n\nMANIFEST.csv lists purpose, dimensions, expected result, licence and SHA-256 for every example. A valid file does not mean gCAM supports its workflow: heightmap conversion and TIFF precision are capability probes.\n\nStart with 03 Vectors/01-sign-mm.svg for 2D or 04 Models/01-dome-relief.stl for 3D. Preview every job and set actual stock/cutter values before cutting. No machine-ready G-code is supplied.\n')
# Contact sheet includes the actual raster source data, labelled by filename.
images=[ROOT/e['file'] for e in entries if e['file'].split('/')[0] in ('01 Heightmaps','02 Bitmaps')]
w=1000; tilew=250; tileh=235; sheet=Image.new('RGB',(w,math.ceil(len(images)/4)*tileh),'#e6e6e6'); draw=ImageDraw.Draw(sheet)
for i,p in enumerate(images):
    with Image.open(p) as im:
        if im.mode.startswith('I'): im=Image.fromarray((np.asarray(im)/257).astype('uint8'))
        im=im.convert('RGBA'); bg=Image.new('RGBA',im.size,'white'); bg.alpha_composite(im); im=bg.convert('RGB'); im.thumbnail((230,195))
        xx=(i%4)*tilew; yy=(i//4)*tileh; sheet.paste(im,(xx+(tilew-im.width)//2,yy+5))
        draw.text((xx+8,yy+202),p.name,fill='black')
sheet.save(ROOT/'CONTACT SHEET.png')
assert len(entries)==23, len(entries)
assert len({e['sha256'] for e in entries})==len(entries)
print(json.dumps({'examples':len(entries),'closed_meshes':len(mesh_validation),'root':str(ROOT)},indent=2))



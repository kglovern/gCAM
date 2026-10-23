import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const write=(name,vertices,triangles)=>{
    const lines=['solid '+name];
    for(const tri of triangles) lines.push('facet normal 0 0 0','outer loop',...tri.map(i=>'vertex '+vertices[i].join(' ')),'endloop','endfacet');
    lines.push('endsolid '+name);
    writeFileSync(fileURLToPath(new URL('../cypress/fixtures/'+name+'.stl',import.meta.url)),lines.join('\n')+'\n');
};
const box=[[-6,-3,0],[8,-3,0],[8,5,0],[-6,5,0],[-6,-3,30],[8,-3,30],[8,5,30],[-6,5,30]];
const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
write('rotary-asymmetric',box,faces);
// A watertight faceted solid with an offset boss, concave pocket and unequal sides.
// Input STL Z is the rotary longitudinal axis; cross section is X/Y.
const vertices=[],triangles=[],n=8;
for(let layer=0;layer<2;layer++)for(let x=0;x<=n;x++)for(let y=0;y<=n;y++){
    const axial=x*4, transverse=y*2-8;
    const boss=4*Math.exp(-((axial-8)**2+(transverse-3)**2)/15);
    const pocket=4*Math.exp(-((axial-24)**2+(transverse+2)**2)/15);
    vertices.push([layer?5+boss-pocket:-5,transverse,axial]);
}
const at=(l,x,y)=>l*(n+1)**2+x*(n+1)+y;
for(let x=0;x<n;x++)for(let y=0;y<n;y++){
    const a=at(0,x,y),b=at(0,x+1,y),c=at(0,x+1,y+1),d=at(0,x,y+1),top=(n+1)**2;
    triangles.push([a,c,b],[a,d,c],[a+top,b+top,c+top],[a+top,c+top,d+top]);
}
const rim=[];
for(let x=0;x<n;x++)rim.push(at(0,x,0));
for(let y=0;y<n;y++)rim.push(at(0,n,y));
for(let x=n;x>0;x--)rim.push(at(0,x,n));
for(let y=n;y>0;y--)rim.push(at(0,0,y));
const top=(n+1)**2;
for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];triangles.push([a,b,b+top],[a,b+top,a+top]);}
write('rotary-faceted-pocket',vertices,triangles);
console.log('Generated rotary-asymmetric.stl and rotary-faceted-pocket.stl');

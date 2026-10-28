process.on('uncaughtException', e => { console.error(e.message); process.exit(1); });
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root=path.resolve('..','Example Files');
const require=createRequire(path.resolve('package.json'));
const esbuild=require('esbuild');
const bundle=await esbuild.build({entryPoints:['src/engine/surface-cam.ts'],bundle:true,platform:'node',format:'esm',write:false});
const core=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const results=[];
for(const name of await fs.readdir(path.join(root,'04 Models'))){
 const data=await fs.readFile(path.join(root,'04 Models',name));
 const mesh=name.endsWith('.obj')?core.parseObj(data.toString('utf8'),name):core.parseStl(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),name);
 assert(mesh.vertices.length>0 && mesh.vertices.length%9===0);
 assert([...mesh.vertices].every(Number.isFinite));
 results.push({file:name,triangles:mesh.vertices.length/9,bounds:mesh.bounds,result:'Parsed by current gCAM surface importer'});
}
assert.equal(results.length,7);
await fs.writeFile(path.join(root,'gcam-import-validation.json'),JSON.stringify(results,null,2)+'\n');
console.log('7 models parsed by gCAM');
const jsdom=require('jsdom');
const dom=new jsdom.JSDOM('');
globalThis.document=dom.window.document; globalThis.window=dom.window; globalThis.DOMParser=dom.window.DOMParser; globalThis.Element=dom.window.Element;
const vectorBundle=await esbuild.build({entryPoints:['src/lib/import.ts'],bundle:true,platform:'node',format:'esm',write:false});
const vectors=await import('data:text/javascript;base64,'+Buffer.from(vectorBundle.outputFiles[0].text).toString('base64'));
const vectorResults=[];
for(const [name,w,h] of [['01-sign-mm.svg',160,100],['02-inch-square.svg',50.8,50.8],['03-plate-mm.dxf',100,60]]){
 const txt=await fs.readFile(path.join(root,'03 Vectors',name),'utf8');
 if(name.endsWith('.svg')) { const units=vectors.svgUnitScaleToMm(txt); const doc=new DOMParser().parseFromString(txt,'image/svg+xml'); assert(!doc.querySelector('parsererror')); const box=doc.documentElement.getAttribute('viewBox').split(' ').map(Number); assert(Math.abs(box[2]*units.scale-w)<.01); assert(Math.abs(box[3]*units.scale-h)<.01); vectorResults.push({file:name,widthMm:w,heightMm:h,result:'XML and current gCAM physical-unit parser verified; browser path sampling not tested'}); continue; }
 const result=await vectors.importVectorFile({name,text:async()=>txt});
 assert(result.bounds && result.loops.length);
 const b=result.bounds,s=result.unitScaleToMm;
 assert(Math.abs((b.maxX-b.minX)*s-w)<.01);
 assert(Math.abs((b.maxY-b.minY)*s-h)<.01);
 vectorResults.push({file:name,loops:result.loops.length,widthMm:w,heightMm:h,result:'Parsed by current gCAM vector importer with expected unit scale'});
}
await fs.writeFile(path.join(root,'gcam-vector-validation.json'),JSON.stringify(vectorResults,null,2)+'\n');
console.log(JSON.stringify(vectorResults,null,2));





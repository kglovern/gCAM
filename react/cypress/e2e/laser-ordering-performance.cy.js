describe('Laser ordering performance', () => {
    it('compares identical real-worker jobs with profile-formatted output', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 120000 }, async (win) => {
                const body = `
                self.onmessage=async ({data})=>{
                    try{
                        const {orderLaserCuts}=await import(data.orderUrl);
                        const {laserTravel}=await import(data.origin+'/src/cam/laser-order.js');
                        const {exportToolpaths}=await import(data.origin+'/src/gcode/exportToolpaths.ts');
                        const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
                        const runs=[];let geometrySha256,gcodeSha256,gcodeBytes,travelMm;
                        for(let round=0;round<5;round++){
                            const start=performance.now();
                            const paths=orderLaserCuts(data.paths,{innerFirst:true,optimizeTravel:true,perforation:true,perforationCut:0.2,perforationSkip:0.1,passes:3});
                            const orderedAt=performance.now();
                            const toolpath={operation:'laser-cut',operationLabel:'Laser Cut',label:'worker benchmark',emission:'laser-cut',
                                laserFeed:1200,laserPower:400,laserOptions:{passes:3},passDepths:[0],previewContours:[],
                                spindle:12000,toolDiameter:1,feedRate:1200,plungeRate:300,safeZ:5,toolNumber:1,
                                laserPaths:paths.map(path=>({points:path.points.map(p=>({...p,power:p.power===0?0:400}))}))};
                            const code=exportToolpaths([toolpath],'worker-benchmark',false,'metric');
                            const end=performance.now();
                            const segments=paths.flatMap(path=>path.points.slice(1).map((p,i)=>JSON.stringify([path.points[i].x,path.points[i].y,p.x,p.y,p.power]))).sort();
                            const geometry=await digest(JSON.stringify(segments)),program=await digest(code);
                            travelMm=laserTravel(paths,undefined,{passes:3});
                            if(round===0){geometrySha256=geometry;gcodeSha256=program;gcodeBytes=new TextEncoder().encode(code).length;}
                            if(geometry!==geometrySha256 || program!==gcodeSha256)throw Error('Non-deterministic output');
                            runs.push({orderingMs:orderedAt-start,totalMs:end-start});
                        }
                        const median=values=>values.sort((a,b)=>a-b)[1];
                        self.postMessage({cold:runs[0],medianOrderingMs:median(runs.slice(2).map(r=>r.orderingMs)),medianTotalMs:median(runs.slice(2).map(r=>r.totalMs)),geometrySha256,gcodeSha256,gcodeBytes,travelMm});
                    }catch(error){self.postMessage({error:String(error)});}
                };
            `;
                const url = win.URL.createObjectURL(
                    new win.Blob([body], { type: 'text/javascript' }),
                );
                const paths = Array.from({ length: 200 }, (_, i) => {
                    const j = (i * 37) % 200,
                        x = (j % 20) * 30 + 10,
                        y = Math.floor(j / 20) * 30 + 10;
                    return {
                        points: [
                            { x, y },
                            { x: x + 20, y },
                            { x: x + 20, y: y + 20 },
                            { x, y: y + 20 },
                            { x, y },
                        ],
                    };
                });
                const results = [];
                try {
                    for (const mode of ['reference', 'optimized']) {
                        const worker = new win.Worker(url, { type: 'module' });
                        try {
                            const result = await new Promise(
                                (resolve, reject) => {
                                    worker.onmessage = (event) =>
                                        event.data.error
                                            ? reject(Error(event.data.error))
                                            : resolve(event.data);
                                    worker.onerror = (event) =>
                                        reject(Error(event.message));
                                    worker.postMessage({
                                        paths,
                                        origin: win.location.origin,
                                        orderUrl:
                                            win.location.origin +
                                            (mode === 'reference'
                                                ? '/scripts/fixtures/laser-order-reference.mjs'
                                                : '/src/cam/laser-order.js'),
                                    });
                                },
                            );
                            results.push({ mode, ...result });
                        } finally {
                            worker.terminate();
                        }
                    }
                } finally {
                    win.URL.revokeObjectURL(url);
                }
                expect(results[0].geometrySha256).to.equal(
                    results[1].geometrySha256,
                );
                expect(results[1].travelMm).to.be.at.most(
                    results[0].travelMm + 1e-6,
                );
                expect(Number.isFinite(results[1].medianOrderingMs)).to.equal(
                    true,
                );
                return {
                    browser: win.navigator.userAgent,
                    contours: 200,
                    passes: 3,
                    scope: 'Fresh module worker per mode, imports excluded; one cold, one warmup, three timed runs. Actual grblHAL profile formatting included; no competitor/controller timing or browser memory measurement.',
                    results,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-ordering-browser-benchmark.json',
                    report,
                ),
            );
    });
});

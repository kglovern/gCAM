describe('Laser formatter performance', () => {
    it('compares fresh worker output across profiles and units with identical input programs', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then({ timeout: 180000 }, async (win) => {
                const body = `self.onmessage=async({data})=>{try{
                const {renderProgram}=await import(data.rendererUrl);
                const {controllerPreset}=await import(data.origin+'/src/gcode/profiles.ts');
                const {orderLaserCuts}=await import(data.origin+'/src/cam/laser-order.js');
                const {buildGcode}=await import(data.origin+'/src/cam/gcode/program.js');
                const paths=orderLaserCuts(data.paths,{innerFirst:true,optimizeTravel:true,perforation:true,perforationCut:0.2,perforationSkip:0.1});
                const toolpath={operation:'laser-cut',operationLabel:'Laser Cut',label:'worker benchmark',emission:'laser-cut',laserFeed:1200,laserPower:400,laserOptions:{passes:3},passDepths:[0],previewContours:[],laserPaths:paths.map(path=>({points:path.points.map(p=>({...p,power:p.power===0?0:400}))}))};
                const canonical=buildGcode({toolpaths:[toolpath],fileName:'formatter-benchmark',forcePolylineArcs:true});
                const settings={...controllerPreset(data.controller),laserConfirmed:true};
                const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
                const runs=[];let sha256,bytes;
                for(let round=0;round<5;round++){
                    const start=performance.now();
                    const output=renderProgram(canonical,settings,data.units,{laser:true,fileName:'formatter-benchmark'});
                    const elapsed=performance.now()-start;
                    const hash=await digest(output);
                    if(round===0){sha256=hash;bytes=new TextEncoder().encode(output).length;}
                    if(hash!==sha256)throw Error('Non-deterministic output');
                    runs.push(elapsed);
                }
                self.postMessage({coldMs:runs[0],medianMs:runs.slice(2).sort((a,b)=>a-b)[1],sha256,bytes,canonicalSha256:await digest(canonical)});
            }catch(error){self.postMessage({error:String(error)});}};`;
                const url = win.URL.createObjectURL(
                    new win.Blob([body], { type: 'text/javascript' }),
                );
                const cases = [];
                try {
                    for (const spec of [
                        { controller: 'grblhal', units: 'metric', count: 200 },
                        { controller: 'duet', units: 'metric', count: 100 },
                        { controller: 'grbl', units: 'imperial', count: 100 },
                    ]) {
                        const paths = Array.from(
                            { length: spec.count },
                            (_, i) => {
                                const j = (i * 37) % spec.count,
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
                            },
                        );
                        const results = [];
                        for (const mode of ['reference', 'optimized']) {
                            const worker = new win.Worker(url, {
                                type: 'module',
                            });
                            try {
                                const result = await new Promise(
                                    (resolve, reject) => {
                                        worker.onmessage = (event) =>
                                            event.data.error
                                                ? reject(
                                                      Error(event.data.error),
                                                  )
                                                : resolve(event.data);
                                        worker.onerror = (event) =>
                                            reject(Error(event.message));
                                        worker.postMessage({
                                            ...spec,
                                            paths,
                                            origin: win.location.origin,
                                            rendererUrl:
                                                win.location.origin +
                                                (mode === 'reference'
                                                    ? '/scripts/fixtures/render-program-reference.ts'
                                                    : '/src/gcode/renderProgram.ts'),
                                        });
                                    },
                                );
                                results.push({ mode, ...result });
                            } finally {
                                worker.terminate();
                            }
                        }
                        expect(results[0].canonicalSha256).to.equal(
                            results[1].canonicalSha256,
                        );
                        expect(results[0].sha256).to.equal(results[1].sha256);
                        expect(results[0].bytes).to.equal(results[1].bytes);
                        cases.push({ ...spec, results });
                    }
                } finally {
                    win.URL.revokeObjectURL(url);
                }
                return {
                    browser: win.navigator.userAgent,
                    scope: 'Fresh worker per mode/case; identical canonical input, imports/planning/emission excluded. One cold, one warmup, three measured renderer runs. No competitor/controller timing or browser memory measurement.',
                    cases,
                };
            })
            .then((report) =>
                cy.writeFile(
                    '../outputs/laser-formatter-browser-benchmark.json',
                    report,
                ),
            );
    });
});

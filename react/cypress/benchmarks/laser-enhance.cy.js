it('measures repeatable large-image enhancement in isolated browser workers', () => {
    cy.freshProject({ tools: false });
    cy.window().then({ timeout: 120000 }, async (win) => {
        const url = new URL('/src/cam/image-lightness.js', win.location.href)
            .href;
        const source = `import {createImageLightnessSampler} from ${JSON.stringify(url)};
self.onmessage=async ({data:{size,radius}})=>{
    const data=new Uint8ClampedArray(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;const v=(x*3+y*7)%256;data.set([v,v,v,(x+y)%17?255:64],i);}
    const output=new Uint8ClampedArray(size*size);
    const start=performance.now();
    const sample=createImageLightnessSampler({width:size,height:size,data},{smoothing:0,sharpening:1.5,grayscale:'luminance',filterRadius:radius,sharpeningDenoise:0.02,imageMode:'grayscale',edgeGain:1});
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)output[y*size+x]=Math.round(sample(x,y)*255);
    const milliseconds=performance.now()-start;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',output))).map(n=>n.toString(16).padStart(2,'0')).join('');
    postMessage({milliseconds,hash});
};postMessage({ready:true});`;
        const trials = [];
        for (const size of [1024, 2048])
            for (const radius of [1, 4, 16])
                for (let repeat = 0; repeat < 2; repeat++) {
                    let ticks = 0;
                    const timer = win.setInterval(() => ticks++, 5);
                    const blob = win.URL.createObjectURL(
                        new win.Blob([source], { type: 'text/javascript' }),
                    );
                    const worker = new win.Worker(blob, { type: 'module' });
                    try {
                        const result = await new Promise((resolve, reject) => {
                            worker.onerror = (e) =>
                                reject(new Error(e.message));
                            worker.onmessage = ({ data }) => {
                                if (data.ready)
                                    worker.postMessage({ size, radius });
                                else resolve(data);
                            };
                        });
                        expect(ticks).to.be.greaterThan(0);
                        const tileHeight = Math.max(
                            1,
                            Math.min(64, Math.floor(262144 / size)),
                        );
                        trials.push({
                            size,
                            radius,
                            repeat,
                            ...result,
                            ticks,
                            sourceBytes: size * size * 4,
                            outputBytes: size * size,
                            filterCacheBoundBytes:
                                radius === 1 ? 0 : size * tileHeight * 8,
                            filterScratchBoundBytes:
                                radius === 1
                                    ? 0
                                    : 64 * (tileHeight + 2 * radius) * 16 +
                                      64 * tileHeight * 8,
                        });
                    } finally {
                        worker.terminate();
                        win.URL.revokeObjectURL(blob);
                        win.clearInterval(timer);
                    }
                }
        for (let i = 0; i < trials.length; i += 2)
            expect(trials[i].hash).to.equal(trials[i + 1].hash);
        cy.writeFile('../outputs/laser-enhance-performance.json', {
            scope: 'Actual isolated browser workers, row-major 1M/4M source and output pixels; timings cover sampler creation and filtering only, exclude source generation, hash, worker startup, UI, CAM and G-code. Typed-array bounds are explicit filter allocations, not measured peak browser memory. No competitor throughput claim.',
            trials,
        });
    });
});

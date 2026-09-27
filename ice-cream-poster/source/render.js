const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const [panel, w, h] of [['front', 1500, 700], ['side', 600, 700]]) {
    const p = await b.newPage({ viewport: { width: Math.round(w*3.7795), height: Math.round(h*3.7795) }, deviceScaleFactor: +(process.argv[2]||0.5) });
    await p.goto('file://' + __dirname + '/poster.html?panel=' + panel);
    await p.waitForSelector('body[data-ready]'); await p.waitForTimeout(300);
    await p.screenshot({ path: `preview-${panel}.png` });
    if (process.argv[3]) await p.pdf({ path: `${panel}.pdf`, width: w + 'mm', height: h + 'mm', printBackground: true, pageRanges: '1' });
  }
  await b.close();
})();

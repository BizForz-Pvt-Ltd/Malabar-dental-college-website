// Optional browser smoke test using an already installed Edge/Chrome and Node 22+.
// node tests/department-hod-browser.cjs [--live]
// node tests/department-hod-browser.cjs --serve (manual review at localhost:8080)
// Set BROWSER_PATH to the browser executable on other platforms.
// --live reads the existing APIs; default tests use synthetic local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pages = {
  'anatomy.html': 85, 'physiology.html': 50, 'biochemistry.html': 51,
  'general-pathology.html': 88, 'general-microbiology.html': 86, 'pharmacology.html': 87,
  'general-medicine.html': 89, 'general-surgery.html': 90, 'oral-pathology.html': 40,
  'public-health.html': 45, 'periodontology.html': 47, 'oral-medicine-and-radiology.html': 46,
  'orthodontics.html': 48, 'oral-and-maxilofacial-surgery.html': 44,
  'conservative-dentistry-&-edodontics.html': 42, 'prosthodontic.html': 41, 'pedodontics.html': 43
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('error', reject, { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    socket.addEventListener('open', () => resolve({
      socket,
      send(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
          const id = ++nextId;
          const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 15000);
          pending.set(id, { resolve, reject, timer });
          socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
      }
    }), { once: true });
  });
}

async function main() {
  const executable = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!process.argv.includes('--serve')) assert.ok(fs.existsSync(executable), 'Set BROWSER_PATH to an installed Edge or Chrome executable.');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    try {
      const requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (requestedPath === '/fixture-portrait.svg') {
        response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="280"><rect width="220" height="280" fill="#edf2ed"/><circle cx="110" cy="90" r="42" fill="#a9b9ab"/><path d="M35 245v-40a75 75 0 0 1 150 0v40" fill="#a9b9ab"/><text x="110" y="270" text-anchor="middle" fill="#526854" font-family="sans-serif" font-size="12">Test fixture portrait</text></svg>');
        return;
      }
      const file = path.resolve(root, '.' + requestedPath);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404); response.end(); return;
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(response);
    } catch (error) { response.writeHead(400); response.end(); }
  });
  await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 8080 : 0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  if (process.argv.includes('--serve')) {
    console.log('Serving the unchanged local files for manual review: ' + base);
    console.log('Press Ctrl+C to stop. Live APIs may require an allowed CORS origin; the automated tests use local fixtures.');
    return;
  }
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'mdcrc-hod-browser-'));
  const browser = spawn(executable, [
    '--headless=new', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + path.join(artifacts, 'profile'), 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let connection;
  try {
    const debugURL = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Browser did not expose its debugging endpoint')), 15000);
      browser.once('error', error => { clearTimeout(timer); reject(error); });
      browser.stderr.on('data', data => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    connection = await connect(debugURL);
    const target = await connection.send('Target.createTarget', { url: 'about:blank' });
    const attached = await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const send = (method, params) => connection.send(method, params, attached.sessionId);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    // Tests are deterministic and do not require third-party integrations or CORS changes.
    await send('Network.setBlockedURLs', { urls: ['https://*', 'http://conext.in/*'] });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const live = {};
    if (process.argv.includes('--live')) {
      for (const [file, id] of Object.entries(pages)) {
        const response = await fetch('https://conext.in/custom_users/api/staff_list_dep_wise/' + id, { signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200, file);
        live[file] = await response.json();
      }
    }
    let initialization;
    let checks = 0;
    async function visit(file, width, data, failure = false) {
      if (initialization) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialization });
      const source = `window.__staffFetchCount = 0;
        const originalFetch = window.fetch;
        window.fetch = async function(input, ...args) {
          if (String(input).includes('staff_list_dep_wise/')) {
            window.__staffFetchCount++;
            ${failure ? "throw new Error('Fixture network failure');" : `return new Response(${JSON.stringify(JSON.stringify(data))}, {status: 200, headers: {'Content-Type': 'application/json'}});`}
          }
          if (String(input).includes('conext.in/')) return new Response('{"status":false,"data":[]}');
          return originalFetch.call(this, input, ...args);
        };`;
      initialization = (await send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: base + '/' + encodeURIComponent(file) });
      let result;
      for (let attempt = 0; attempt < 100; attempt++) {
        await delay(50);
        result = await evaluate(`(() => {
          const mount = document.getElementById('department-hod-container');
          const staff = document.getElementById('staff-list-container');
          if (!mount || !staff || !window.__staffFetchCount || document.readyState !== 'complete'
              || decodeURIComponent(location.pathname) !== ${JSON.stringify('/' + file)}) return null;
          const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom}; };
          const hod = mount.querySelector('.department-hod');
          const heading = [...document.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Department Faculty');
          return {
            width: innerWidth, requests: window.__staffFetchCount,
            mounts: document.querySelectorAll('#staff-list-container').length,
            hodCount: mount.querySelectorAll('.department-hod').length,
            hodNames: [...mount.querySelectorAll('.department-hod__name')].map(n => n.textContent),
            names: [...staff.querySelectorAll('h3')].map(n => n.textContent),
            links: [...mount.querySelectorAll('a')].map(n => ({href:n.getAttribute('href'),text:n.textContent})),
            error: !!staff.querySelector('.department-staff-error'),
            portrait: hod ? rect(hod.querySelector('.department-hod__portrait')) : null,
            details: hod ? rect(hod.querySelector('.department-hod__details')) : null,
            hod: hod ? rect(hod) : null,
            heading: heading ? rect(heading) : null,
            teaching: staff.querySelector('h2') ? rect(staff.querySelector('h2')) : null,
            hodOverflow: hod ? hod.scrollWidth > hod.clientWidth : false,
            staffOverflow: staff.scrollWidth > staff.clientWidth,
            pageWidth: document.documentElement.scrollWidth
          };
        })()`);
        if (result) break;
      }
      assert.ok(result, file + ': faculty rendering did not complete');
      assert.equal(result.requests, 1, file + ': extra staff request');
      assert.equal(result.mounts, 1, file);
      assert.ok(result.heading, file + ': missing visible faculty heading');
      checks++;
      return result;
    }
    const faculty = (name, designation = 'Reader') => ({ name, designation, picture: base + '/fixture-portrait.svg' });
    const basic = {
      status: true,
      teaching_staff: [faculty('Fixture Teaching Staff'), { ...faculty('Fixture HOD', 'Professor & HOD'), email: 'faculty@example.edu', mobile_number: '+91 86065 99960', bio: 'A synthetic biography used for local browser verification.' }],
      non_teaching_staff: [faculty('Fixture Support Staff', 'Assistant')]
    };
    for (const width of [360, 768, 1440]) {
      for (const file of Object.keys(pages)) {
        const result = await visit(file, width, basic);
        assert.equal(result.hodCount, 1, file);
        assert.deepEqual(result.hodNames, ['Fixture HOD']);
        assert.deepEqual(result.names, ['Fixture Teaching Staff', 'Fixture Support Staff']);
        assert.equal(result.links.length, 2, file);
        assert.equal(result.hodOverflow, false, file + ': HOD overflows at ' + width);
        assert.equal(result.staffOverflow, false, file + ': staff grid overflows at ' + width);
        assert.ok(result.heading.bottom <= result.hod.y + 1, file + ': HOD before heading');
        assert.ok(result.hod.bottom <= result.teaching.y + 1, file + ': HOD after staff');
        if (width === 360) assert.ok(result.details.y >= result.portrait.bottom, file + ': portrait/text must stack');
        else assert.ok(result.details.x >= result.portrait.right, file + ': portrait/text must align horizontally');
        if (file === 'oral-medicine-and-radiology.html' && width !== 768) {
          await evaluate("document.getElementById('department-hod-container').scrollIntoView({block:'start'}); window.scrollBy(0, -180);");
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(artifacts, 'hod-' + width + '.png'), Buffer.from(shot.data, 'base64'));
        }
      }
      console.log('PASS: all 17 pages at ' + width + 'px');
    }
    const file = 'oral-medicine-and-radiology.html';
    for (const data of [
      { status: true, teaching_staff: [] },
      { status: true, non_teaching_staff: [faculty('Support only', 'Assistant')] },
      { status: true, teaching_staff: [faculty('First HOD', 'H.O.D.'), faculty('Second HOD', 'Reader & HOD')] }
    ]) {
      const result = await visit(file, 360, data);
      assert.equal(result.hodCount, 0);
      assert.equal(result.names.length, (data.teaching_staff || []).length + (data.non_teaching_staff || []).length);
      assert.equal(result.error, false);
    }
    const unsafe = { status: true, teaching_staff: [{ name: '<img src=x onerror=alert(1)>', designation: 'Reader & HOD', bio: '<script>alert(1)</script>', picture: base + '/missing-photo.jpg', email: 'invalid', mobile_number: null }] };
    const result = await visit(file, 360, unsafe);
    assert.deepEqual(result.hodNames, [unsafe.teaching_staff[0].name]);
    assert.equal(result.links.length, 0);
    await delay(100);
    assert.equal(await evaluate("document.querySelector('.department-hod__fallback').hidden"), false);
    assert.equal(await evaluate("document.querySelectorAll('.department-hod script, .department-hod img').length"), 0);
    assert.equal((await visit(file, 360, {}, true)).error, true);
    for (const [liveFile, data] of Object.entries(live)) {
      if (liveFile === 'oral-medicine-and-radiology.html') {
        await send('Network.setBlockedURLs', { urls: ['https://conext.in/*', 'https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
      }
      const result = await visit(liveFile, 1440, data);
      assert.equal(result.error, data.status !== true, liveFile);
      assert.equal(result.names.length + result.hodCount, (data.teaching_staff || []).length + (data.non_teaching_staff || []).length, liveFile + ': lost or duplicated records');
      if (liveFile === 'oral-medicine-and-radiology.html') {
        assert.deepEqual(result.hodNames, ['Dr. Asaf Aboobakker']);
        assert.equal(result.names.length, 10);
        const hod = data.teaching_staff.find(staff => staff.name === result.hodNames[0]);
        assert.equal(result.links.find(link => link.href.startsWith('mailto:')).text, hod.email);
        assert.equal(result.links.find(link => link.href.startsWith('tel:')).text, hod.mobile_number);
        const loaded = await evaluate("!!document.querySelector('.department-hod__image')?.naturalWidth");
        console.log((loaded ? 'PASS' : 'WARNING') + ': live Oral Medicine HOD portrait ' + (loaded ? 'loaded' : 'uses neutral fallback'));
        await evaluate("document.getElementById('department-hod-container').scrollIntoView({block:'start'}); window.scrollBy(0, -180);");
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifacts, 'hod-live-1440.png'), Buffer.from(shot.data, 'base64'));
        await send('Network.setBlockedURLs', { urls: ['https://*', 'http://conext.in/*'] });
      }
      if (liveFile === 'public-health.html') {
        assert.deepEqual(result.hodNames, ['Dr Abdul Saheer P']);
        assert.equal(result.names.length, 3);
      }
      console.log('PASS live response: ' + liveFile + ' (' + result.hodCount + ' HOD, ' + result.names.length + ' other staff)');
    }
    console.log('PASS: ' + checks + ' browser scenarios. Screenshots: ' + artifacts);
  } finally {
    if (connection) {
      await connection.send('Browser.close').catch(() => {});
      connection.socket.close();
    }
    if (browser.exitCode === null) browser.kill();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

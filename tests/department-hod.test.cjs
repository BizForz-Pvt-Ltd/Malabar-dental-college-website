// Run from the repository root: node --test tests/department-hod.test.cjs
// Uses Node's built-in test runner; no packages or build step required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const pages = {
  'anatomy.html': 85,
  'physiology.html': 50,
  'biochemistry.html': 51,
  'general-pathology.html': 88,
  'general-microbiology.html': 86,
  'pharmacology.html': 87,
  'general-medicine.html': 89,
  'general-surgery.html': 90,
  'oral-pathology.html': 40,
  'public-health.html': 45,
  'periodontology.html': 47,
  'oral-medicine-and-radiology.html': 46,
  'orthodontics.html': 48,
  'oral-and-maxilofacial-surgery.html': 44,
  'conservative-dentistry-&-edodontics.html': 42,
  'prosthodontic.html': 41,
  'pedodontics.html': 43
};
const helperSource = fs.readFileSync(path.join(root, 'js/department-hod.js'), 'utf8');

// A deliberately small DOM test double. Browser checks cover real layout and parsing.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.ownText = '';
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(node => node.textContent).join(''); }
  set innerHTML(value) { throw new Error('API text must not be rendered using innerHTML'); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.ownText = ''; nodes.forEach(node => this.appendChild(node)); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
}

function nodes(element) { return [element, ...element.children.flatMap(nodes)]; }
function byClass(element, className) { return nodes(element).filter(node => (node.className || '').split(' ').includes(className)); }
function staffScript(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(script => script.includes('staff_list_dep_wise'));
}
function environment(fetch) {
  const staffMount = new Element('div');
  const hodMount = new Element('div');
  const warnings = [];
  const errors = [];
  const opened = [];
  const document = {
    createElement: tag => new Element(tag),
    getElementById: id => id === 'staff-list-container' ? staffMount : id === 'department-hod-container' ? hodMount : null,
    querySelector(selector) { return this.getElementById(selector.slice(1)); }
  };
  const context = vm.createContext({
    document, URL, fetch,
    console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    open: (...args) => opened.push(args)
  });
  context.window = context;
  vm.runInContext(helperSource, context);
  return { context, helper: context.DepartmentHOD, staffMount, hodMount, warnings, errors, opened };
}

function record(overrides = {}) {
  return { name: 'Fixture Faculty', designation: 'Professor & HOD', ...overrides };
}

for (const designation of [
  'Professor & HOD', 'Reader & HOD', 'Associate Professor & HOD', 'Lecturer & HOD', 'HOD',
  'Professor and Head of Department', 'Head of Department', 'Head of the Department',
  'H.O.D.', 'Professor & H. O. D.', 'H-O-D', 'Professor & H / O / D', ' h o d ',
  '  pRoFeSsOr   AND  hEaD\tof\nDepartment  ', 'Hod In Charge'
]) {
  test('detects ' + JSON.stringify(designation), () => {
    assert.equal(environment().helper.isHOD(designation), true);
  });
}
for (const designation of ['Reader & HASA', 'Professor & Vice Principal', 'Associate Dean', 'Methodologist', 'HODology', 'Head of Departmental Research', '', null, undefined, 12]) {
  test('does not detect ' + JSON.stringify(designation), () => {
    assert.equal(environment().helper.isHOD(designation), false);
  });
}

test('selects by designation and object identity, preserves order and original arrays', () => {
  const { helper } = environment();
  const first = record({ name: 'Zed', designation: 'Reader' });
  const hod = record({ name: 'Same Name' });
  const other = record({ name: 'Same Name', designation: 'Lecturer' });
  const nonTeaching = record(); // Never removed, even with an HOD designation.
  const data = { teaching_staff: Object.freeze([first, hod, other]), non_teaching_staff: Object.freeze([nonTeaching]) };
  const result = helper.selectStaff(data);
  assert.equal(result.hod, hod);
  assert.deepEqual(Array.from(result.teachingStaff), [first, other]);
  assert.deepEqual(Array.from(result.nonTeachingStaff), [nonTeaching]);
  assert.notEqual(result.nonTeachingStaff, data.non_teaching_staff);
  assert.deepEqual(data.teaching_staff, [first, hod, other]);
});

test('no HOD preserves every normal staff record', () => {
  const data = { teaching_staff: [record({ designation: 'Reader & HASA' })] };
  const result = environment().helper.selectStaff(data);
  assert.equal(result.hod, null);
  assert.deepEqual(Array.from(result.teachingStaff), data.teaching_staff);
});

for (const data of [{}, { teaching_staff: null, non_teaching_staff: {} }, { teaching_staff: [], non_teaching_staff: [] }, { non_teaching_staff: [record()] }]) {
  test('normalizes missing, invalid, empty arrays / non-teaching only: ' + JSON.stringify(data), () => {
    const result = environment().helper.selectStaff(data);
    assert.equal(result.hod, null);
    assert.equal(result.teachingStaff.length, 0);
    assert.equal(result.nonTeachingStaff.length, Array.isArray(data.non_teaching_staff) ? data.non_teaching_staff.length : 0);
  });
}

test('multiple HOD candidates remain in Teaching Staff and emit a warning', () => {
  const env = environment();
  const data = { teaching_staff: [record(), record({ designation: 'Reader & HOD' })] };
  const result = env.helper.selectStaff(data);
  assert.equal(result.hod, null);
  assert.deepEqual(Array.from(result.teachingStaff), data.teaching_staff);
  assert.equal(env.warnings.length, 1);
  env.helper.render(result.hod, env.hodMount);
  assert.equal(env.hodMount.children.length, 0);
});

for (const contact of [
  { email: 'faculty@example.edu', mobile_number: '+91 (86065) 99960', links: ['mailto:faculty%40example.edu', 'tel:+918606599960'] },
  { email: 'faculty@example.edu', mobile_number: null, links: ['mailto:faculty%40example.edu'] },
  { email: '', mobile_number: '8606599960', links: ['tel:8606599960'] },
  { mobile_number: '(860) 659-9960', links: ['tel:8606599960'] },
  { email: undefined, mobile_number: 8606599960, links: ['tel:8606599960'] },
  { email: null, mobile_number: undefined, links: [] },
  { email: 'a@example.edu?subject=Injected', mobile_number: 'javascript:alert(1)', links: [] },
  { email: 'a@example.edu\nBcc:victim@example.edu', mobile_number: '+123;ext=90', links: [] },
  { email: 'null', mobile_number: '123', links: [] }
]) {
  test('optional contacts are validated: ' + JSON.stringify(contact), () => {
    const env = environment();
    const hod = record(contact);
    env.helper.render(hod, env.hodMount);
    assert.deepEqual(nodes(env.hodMount).filter(node => node.tag === 'a').map(node => node.href), contact.links);
    assert.equal(byClass(env.hodMount, 'department-hod__name')[0].textContent, hod.name);
    assert.equal(byClass(env.hodMount, 'department-hod__designation')[0].textContent, hod.designation);
    assert.equal(byClass(env.hodMount, 'department-hod__bio').length, 0);
  });
}

test('uses the API designation verbatim and renders untrusted content only as text', () => {
  const env = environment();
  const hod = record({ name: '<img src=x onerror=alert(1)>', designation: ' Reader & HOD ', bio: '<script>alert(1)</script>' });
  env.helper.render(hod, env.hodMount);
  assert.equal(byClass(env.hodMount, 'department-hod__name')[0].textContent, hod.name);
  assert.equal(byClass(env.hodMount, 'department-hod__designation')[0].textContent, hod.designation);
  assert.equal(byClass(env.hodMount, 'department-hod__bio')[0].textContent, hod.bio);
  assert.equal(nodes(env.hodMount).filter(node => node.tag === 'script' || node.tag === 'img').length, 0);
});

test('missing name/designation has no invented text; repeated rendering cannot duplicate HOD', () => {
  const env = environment();
  env.helper.render(record(), env.hodMount);
  env.helper.render({ name: null, designation: undefined }, env.hodMount);
  assert.equal(byClass(env.hodMount, 'department-hod').length, 1);
  assert.equal(byClass(env.hodMount, 'department-hod__name').length, 0);
  assert.equal(byClass(env.hodMount, 'department-hod__designation').length, 0);
  env.helper.render(null, env.hodMount);
  assert.equal(env.hodMount.children.length, 0);
});

test('missing, unsafe and broken photos have a neutral fallback; valid portraits reserve space', () => {
  const env = environment();
  for (const picture of [null, undefined, '', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://user:password@example.edu/photo.jpg']) {
    env.helper.render(record({ picture }), env.hodMount);
    assert.equal(nodes(env.hodMount).filter(node => node.tag === 'img').length, 0);
    assert.equal(byClass(env.hodMount, 'department-hod__fallback')[0].hidden, false);
  }
  env.helper.render(record({ picture: 'https://example.edu/photo.jpg' }), env.hodMount);
  const image = nodes(env.hodMount).find(node => node.tag === 'img');
  assert.equal(image.width, 220);
  assert.equal(image.height, 280);
  assert.match(image.alt, /Fixture Faculty/);
  image.onerror();
  assert.equal(nodes(env.hodMount).filter(node => node.tag === 'img').length, 0);
  assert.equal(byClass(env.hodMount, 'department-hod__fallback')[0].hidden, false);
});

test('existing staff portrait click opens the validated picture; failed pictures disable it', () => {
  const env = environment();
  const image = new Element('img');
  env.helper.configureStaffImage(image, record({ picture: 'https://example.edu/photo.jpg' }));
  image.onclick();
  assert.deepEqual(env.opened, [['https://example.edu/photo.jpg', '_blank', 'noopener,noreferrer']]);
  image.onerror();
  assert.equal(image.onclick, null);
  assert.equal(image.src, undefined);
});

for (const [file, id] of Object.entries(pages)) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const liveHTML = html.replace(/<!--[\s\S]*?-->/g, '');
  const script = staffScript(html);
  test(file + ': correct endpoint, one mount/include/initialization, no legacy HOD code, valid syntax', () => {
    assert.equal((html.match(/staff_list_dep_wise\/\d+/g) || []).length, 1);
    assert.ok(html.includes('https://conext.in/custom_users/api/staff_list_dep_wise/' + id + '"'));
    for (const attribute of ['id="staff-list-container"', 'id="department-hod-container"', 'src="js/department-hod.js"', 'href="css/department-hod.css"']) {
      assert.equal(liveHTML.split(attribute).length - 1, 1, attribute);
    }
    assert.match(liveHTML, />Department Faculty<\/h3>(?:<\/div>)?\s*<div id="department-hod-container">/);
    assert.equal((script.match(/fetchAndDisplayStaffList\(\);/g) || []).length, 1);
    assert.equal((script.match(/DepartmentHOD\.render\(/g) || []).length, 1);
    assert.doesNotMatch(script, /hodWrapper|teachingStaffWithoutHOD|data\.teaching_staff\.find|staffList = staffList\.filter/);
    assert.ok(html.indexOf('src="js/department-hod.js"') < html.indexOf('const apiUrlStaffList'));
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1], { filename: file });
    assert.ok(fs.existsSync(path.join(root, 'js/department-hod.js')));
    assert.ok(fs.existsSync(path.join(root, 'css/department-hod.css')));
  });

  test(file + ': original card renderer uses selected HOD and preserves remaining staff, sorting and input', async () => {
    const hod = record({ name: 'Selected HOD' });
    const data = { status: true, teaching_staff: [record({ name: 'Zed', designation: 'Reader' }), hod, record({ name: 'Amy', designation: 'Reader' }), record({ name: 'Vice Principal', designation: 'Professor & Vice Principal' })], non_teaching_staff: [record({ name: 'Non-teaching HOD' }), record({ name: 'Support', designation: 'Assistant' })] };
    const before = JSON.stringify(data);
    const env = environment(async () => ({ ok: true, json: async () => data }));
    vm.runInContext(script, env.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.errors.length, 0);
    assert.equal(byClass(env.hodMount, 'department-hod__name')[0].textContent, hod.name);
    const names = nodes(env.staffMount).filter(node => node.tag === 'h3').map(node => node.textContent);
    const teachingOrder = file === 'anatomy.html' || file === 'public-health.html'
      ? ['Amy', 'Vice Principal', 'Zed'] : ['Amy', 'Zed', 'Vice Principal'];
    assert.deepEqual(names, [...teachingOrder, 'Non-teaching HOD', 'Support']);
    assert.ok(!names.includes(hod.name));
    assert.equal(JSON.stringify(data), before);
  });

  test(file + ': empty, missing, non-teaching only, ambiguous and missing-field data render safely', async () => {
    for (const data of [
      { status: true },
      { status: true, teaching_staff: [], non_teaching_staff: [] },
      { status: true, non_teaching_staff: [record({ designation: 'Support' })] },
      { status: true, teaching_staff: [record(), record({ designation: 'Reader & HOD' })] },
      { status: true, teaching_staff: [{ designation: 'HOD' }, {}, { name: null }] }
    ]) {
      const env = environment(async () => ({ ok: true, json: async () => data }));
      vm.runInContext(script, env.context);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(env.errors.length, 0);
      if (!data.teaching_staff || !data.teaching_staff.length || data.teaching_staff.length === 2) assert.equal(env.hodMount.children.length, 0);
      if (data.teaching_staff?.length === 2) {
        assert.equal(env.warnings.length, 1);
        assert.equal(nodes(env.staffMount).filter(node => node.tag === 'h3').length, 2);
      }
      assert.doesNotMatch(env.staffMount.textContent, /undefined|null/);
    }
  });

  test(file + ': network / HTTP / JSON / status failures stay inside the staff area and clear stale HOD', async () => {
    for (const fetch of [
      async () => { throw new Error('Network failure'); },
      async () => ({ ok: false, status: 503, json: () => { throw new Error('Must not parse failed HTTP response'); } }),
      async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }),
      async () => ({ ok: true, json: async () => ({ status: false }) }),
      async () => ({ ok: true, json: async () => null })
    ]) {
      const env = environment(fetch);
      env.helper.render(record(), env.hodMount);
      vm.runInContext(script, env.context);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(env.hodMount.children.length, 0);
      assert.equal(env.staffMount.children.length, 1);
      assert.equal(env.staffMount.children[0].attributes.role, 'status');
      assert.match(env.staffMount.textContent, /temporarily unavailable/);
      assert.equal(env.errors.length, 1);
    }
  });
}

test('Oral Medicine / Public Health regression fixtures retain the expected counts', async () => {
  for (const [file, name, teachingCount, nonTeachingCount] of [
    ['oral-medicine-and-radiology.html', 'Dr. Asaf Aboobakker', 5, 5],
    ['public-health.html', 'Dr Abdul Saheer P', 2, 1]
  ]) {
    // The prompt supplied HOD identities and counts, not complete lists: other names are synthetic.
    const data = { status: true, teaching_staff: [record({ name }), ...Array.from({ length: teachingCount }, (_, i) => record({ name: 'Teaching fixture ' + i, designation: i === 0 ? 'Reader & HASA' : 'Sr. Lecturer' }))], non_teaching_staff: Array.from({ length: nonTeachingCount }, (_, i) => record({ name: 'Support fixture ' + i, designation: 'Assistant' })) };
    const env = environment(async () => ({ ok: true, json: async () => data }));
    vm.runInContext(staffScript(fs.readFileSync(path.join(root, file), 'utf8')), env.context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(byClass(env.hodMount, 'department-hod__name')[0].textContent, name);
    const grids = env.staffMount.children.filter(node => node.style.display === 'grid');
    assert.equal(grids[0].children.length, teachingCount);
    assert.equal(grids[1].children.length, nonTeachingCount);
  }
});

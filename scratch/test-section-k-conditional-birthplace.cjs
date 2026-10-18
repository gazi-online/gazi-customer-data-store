/**
 * GAZI SMART FORM FILLER — SECTION K CONDITIONAL BIRTH-PLACE LOGIC TEST SUITE
 * File: scratch/test-section-k-conditional-birthplace.cjs
 *
 * Verifies the State-Aware Conditional Birth-Place Logic in Section K (v1.6.2-GOLD):
 * 1. State Tracking: sessionState records lastSelectedRelationC and lastSelectedRelationJ
 * 2. Helper: isDirectLineageRelation accurately checks Father/Mother vs Husband/Guardian/Other
 * 3. Scenario 1: Direct Lineage (Father/Mother in C or J) -> Auto-fills current village from GCDS
 * 4. Scenario 2: Other Relations (Husband/Guardian) -> Stops automation, renders #gcds-birthplace-card,
 *    and fills manual input upon confirmation or fallback to same village
 * 5. State Persistence: Back-and-forth resilience & window.__GCDS_FILL_ENGINE exports
 * 6. DOM Cleanup: #gcds-birthplace-card is removed on cleanup
 */

const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log('🚀 SECTION K CONDITIONAL BIRTH-PLACE LOGIC (v1.6.2-GOLD) TESTS');
console.log('================================================================\n');

class MockClassList {
  constructor(el) {
    this.el = el;
    this.classes = new Set();
  }
  add(...names) { names.forEach(n => this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  contains(n) { return this.classes.has(n); }
  toggle(n) { if (this.classes.has(n)) this.classes.delete(n); else this.classes.add(n); }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.name = '';
    this._value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this.disabled = false;
    this.classList = new MockClassList(this);
    this.options = [];
  }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    parseHTMLIntoMock(this, html);
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : (event.type || 'click');
    const list = this.listeners[type] || [];
    list.forEach(fn => fn(event));
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
  }

  focus() { this.focused = true; }
  scrollIntoView() {}
  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    const walk = (node) => {
      if (matchesSelector(node, sel)) results.push(node);
      for (const ch of node.children) walk(ch);
    };
    for (const ch of this.children) walk(ch);
    return results;
  }
}

function matchesSelector(el, sel) {
  const parts = sel.split(',').map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith('#') && el.id === p.slice(1)) return true;
    if (p.startsWith('.') && el.classList.contains(p.slice(1))) return true;
    if (p.includes('[id="') && el.id === p.match(/\[id="([^"]+)"\]/)[1]) return true;
    if (p.includes('[name="') && el.name === p.match(/\[name="([^"]+)"\]/)[1]) return true;
    if (p.includes('[placeholder="') && (el.attributes['placeholder'] || '') === p.match(/\[placeholder="([^"]+)"\]/)[1]) return true;
    if (p.toLowerCase() === el.tagName.toLowerCase()) return true;
    if (p.toLowerCase().startsWith(el.tagName.toLowerCase())) {
      const rest = p.slice(el.tagName.length);
      if (rest.startsWith('#') && el.id === rest.slice(1)) return true;
      if (rest.startsWith('.') && el.classList.contains(rest.slice(1))) return true;
      if (rest.includes('[name="') && el.name === rest.match(/\[name="([^"]+)"\]/)[1]) return true;
    }
  }
  return false;
}

function parseHTMLIntoMock(parent, html) {
  // Extract inputs
  const inputMatches = html.matchAll(/<input[^>]+>/g);
  for (const m of inputMatches) {
    const tag = m[0];
    const inp = new MockHTMLInputElement('input');
    const idM = tag.match(/id="([^"]+)"/);
    if (idM) inp.id = idM[1];
    const classM = tag.match(/class="([^"]+)"/);
    if (classM) classM[1].split(/\s+/).forEach(c => inp.classList.add(c));
    const nameM = tag.match(/name="([^"]+)"/);
    if (nameM) inp.name = nameM[1];
    parent.appendChild(inp);
  }

  // Extract buttons
  const buttonMatches = html.matchAll(/<button[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g);
  for (const m of buttonMatches) {
    const btn = new MockElement('button');
    btn.id = m[1];
    btn.innerHTML = m[2];
    parent.appendChild(btn);
  }

  // Extract summary card rows
  const summaryMatches = html.matchAll(/<div class="gcds-decl-row">([\s\S]*?)<\/div>/g);
  for (const m of summaryMatches) {
    const row = new MockElement('div');
    row.classList.add('gcds-decl-row');
    row.innerHTML = m[1];
    parent.appendChild(row);
  }
}

// Global DOM Mock
class MockHTMLInputElement extends MockElement {}
Object.defineProperty(MockHTMLInputElement.prototype, 'value', {
  get() { return this._value; },
  set(v) { this._value = String(v); },
  configurable: true,
});

const mockDocument = {
  body: new MockElement('body'),
  head: new MockElement('head'),
  createElement(tag) {
    if (tag.toLowerCase() === 'input') return new MockHTMLInputElement(tag);
    return new MockElement(tag);
  },
  getElementById(id) {
    return this.body.querySelector('#' + id);
  },
  querySelector(sel) {
    return this.body.querySelector(sel);
  },
  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel);
  },
};

global.window = {
  location: { origin: 'https://voters.eci.gov.in', pathname: '/form6' },
  document: mockDocument,
  HTMLElement: MockElement,
  HTMLInputElement: MockHTMLInputElement,
  Event: class { constructor(type) { this.type = type; } },
  KeyboardEvent: class { constructor(type) { this.type = type; } },
  MouseEvent: class { constructor(type) { this.type = type; } },
  chrome: {
    storage: {
      local: {
        get: (k, cb) => cb({}),
        set: (o, cb) => { if (cb) cb(); },
      },
      session: {
        get: (k, cb) => cb({}),
        set: (o, cb) => { if (cb) cb(); },
      },
    },
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: (m, cb) => { if (cb) cb({}); },
    },
  },
};
global.document = mockDocument;
global.Event = class { constructor(type) { this.type = type; } };
global.KeyboardEvent = class { constructor(type) { this.type = type; } };
global.HTMLInputElement = MockHTMLInputElement;

// Create Section K DOM structure in mockDocument.body
const boxK = new MockElement('div');
boxK.classList.add('box');
boxK.id = 'box-k';
boxK.setAttribute('aria-label', '11. Declaration');

const villInp = new MockHTMLInputElement('input');
villInp.id = 'village';
villInp.name = 'village';
boxK.appendChild(villInp);

const stateSelect = new MockElement('select');
stateSelect.id = 'stateCodeA';
stateSelect.name = 'stateCodeA';
boxK.appendChild(stateSelect);

const distSelect = new MockElement('select');
distSelect.id = 'districtCdA';
distSelect.name = 'districtCdA';
boxK.appendChild(distSelect);

const dobInp = new MockHTMLInputElement('input');
dobInp.name = 'dob';
dobInp.setAttribute('placeholder', 'mm-yyyy');
boxK.appendChild(dobInp);

const placeInp = new MockHTMLInputElement('input');
placeInp.id = 'Place';
placeInp.name = 'Place';
boxK.appendChild(placeInp);

const dateInp = new MockHTMLInputElement('input');
dateInp.name = 'date';
dateInp.attributes['type'] = 'date';
boxK.appendChild(dateInp);

const nextBtnK = new MockElement('button');
nextBtnK.classList.add('next-btn');
boxK.appendChild(nextBtnK);

mockDocument.body.appendChild(boxK);

// Load and evaluate content.js
const contentJs = fs.readFileSync('extension/content.js', 'utf8');
eval(contentJs);
const engine = global.window.__GCDS_FILL_ENGINE;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅ [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] ' + name + ':', err.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  ✅ [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] ' + name + ':', err.message);
    failed++;
  }
}

(async () => {
  console.log('--- 1. Engine Exports & Helpers ---');

  test('isDirectLineageRelation correctly identifies parental vs non-parental lineage', () => {
    assert.strictEqual(typeof engine.isDirectLineageRelation, 'function');
    assert.strictEqual(engine.isDirectLineageRelation('FTHR'), true);
    assert.strictEqual(engine.isDirectLineageRelation('MTHR'), true);
    assert.strictEqual(engine.isDirectLineageRelation('Father'), true);
    assert.strictEqual(engine.isDirectLineageRelation('Mother'), true);
    assert.strictEqual(engine.isDirectLineageRelation('পিতা'), true);
    assert.strictEqual(engine.isDirectLineageRelation('মাতা'), true);

    // Negative / Non-parental relations
    assert.strictEqual(engine.isDirectLineageRelation('HSBN'), false);
    assert.strictEqual(engine.isDirectLineageRelation('Husband'), false);
    assert.strictEqual(engine.isDirectLineageRelation('WIFE'), false);
    assert.strictEqual(engine.isDirectLineageRelation('Wife'), false);
    assert.strictEqual(engine.isDirectLineageRelation('GRDN'), false);
    assert.strictEqual(engine.isDirectLineageRelation('Guardian'), false);
    assert.strictEqual(engine.isDirectLineageRelation('OTHR'), false);
    assert.strictEqual(engine.isDirectLineageRelation(''), false);
    assert.strictEqual(engine.isDirectLineageRelation(null), false);
  });

  test('sessionState is initialized and exported', () => {
    assert.ok(engine.sessionState, 'sessionState should be exported');
    assert.ok('lastSelectedRelationC' in engine.sessionState);
    assert.ok('lastSelectedRelationJ' in engine.sessionState);
    assert.ok('birthPlaceManualConfirmed' in engine.sessionState);
    assert.ok('birthPlaceValue' in engine.sessionState);
  });

  test('promptManualBirthPlace is exported', () => {
    assert.strictEqual(typeof engine.promptManualBirthPlace, 'function');
  });

  console.log('\n--- 2. Scenario 1: Direct Lineage (Father/Mother) Auto-Fill ---');

  await testAsync('Auto-fills birth village with current village when Father selected in Section C', async () => {
    engine.sessionState.lastSelectedRelationC = 'FTHR';
    engine.sessionState.lastSelectedRelationJ = null;
    engine.sessionState.birthPlaceManualConfirmed = false;
    engine.sessionState.birthPlaceValue = '';

    const mockData = {
      address: { village: 'Shwetpur', state: 'WEST BENGAL', district: 'NORTH 24 PARGANAS' },
      address_since: '01-2015',
    };

    villInp.value = '';

    // Trigger Section K handler
    const declPromise = engine.handleSectionKDeclaration(mockData);

    // Village should be auto-filled immediately without showing birthplace manual card
    assert.strictEqual(villInp.value, 'Shwetpur');
    assert.strictEqual(mockDocument.getElementById('gcds-birthplace-card'), null);

    // Confirm declaration card to complete step
    const declCard = mockDocument.getElementById('gcds-declaration-card');
    assert.ok(declCard, 'Declaration card should be visible');
    assert.ok(declCard.innerHTML.includes('Shwetpur'), 'Declaration card displays Shwetpur');
    const btnConfirmDecl = declCard.querySelector('#gcds-btn-confirm-declaration');
    btnConfirmDecl.click();

    await declPromise;
  });

  await testAsync('Auto-fills birth village with current village when Mother selected in Section J', async () => {
    engine.sessionState.lastSelectedRelationC = 'HSBN'; // Husband in C
    engine.sessionState.lastSelectedRelationJ = 'MTHR'; // Mother in J
    engine.sessionState.birthPlaceManualConfirmed = false;
    engine.sessionState.birthPlaceValue = '';

    const mockData = {
      address: { village: 'Gopalpur', state: 'WEST BENGAL', district: 'NORTH 24 PARGANAS' },
      address_since: '05-2018',
    };

    villInp.value = '';

    const declPromise = engine.handleSectionKDeclaration(mockData);

    assert.strictEqual(villInp.value, 'Gopalpur');
    assert.strictEqual(mockDocument.getElementById('gcds-birthplace-card'), null);

    const declCard = mockDocument.getElementById('gcds-declaration-card');
    const btnConfirmDecl = declCard.querySelector('#gcds-btn-confirm-declaration');
    btnConfirmDecl.click();
    await declPromise;
  });

  console.log('\n--- 3. Scenario 2: Other Relations (Husband/Guardian) HITL Action Card ---');

  await testAsync('Stops and shows #gcds-birthplace-card when only Husband selected in C and J', async () => {
    engine.sessionState.lastSelectedRelationC = 'HSBN';
    engine.sessionState.lastSelectedRelationJ = 'HSBN';
    engine.sessionState.birthPlaceManualConfirmed = false;
    engine.sessionState.birthPlaceValue = '';

    const mockData = {
      address: { village: 'Shwetpur', state: 'WEST BENGAL', district: 'NORTH 24 PARGANAS' },
      address_since: '01-2015',
    };

    villInp.value = '';

    const declPromise = engine.handleSectionKDeclaration(mockData);

    // Automation should pause and render #gcds-birthplace-card
    const birthCard = mockDocument.getElementById('gcds-birthplace-card');
    assert.ok(birthCard, '#gcds-birthplace-card must be displayed');
    assert.ok(birthCard.innerHTML.includes('Please enter Birth Village/Town manually'));
    assert.ok(birthCard.innerHTML.includes('Husband'));

    // Manual input field and confirm button should exist
    const manualInp = birthCard.querySelector('#gcds-manual-birth-village');
    const btnConfirm = birthCard.querySelector('#gcds-btn-confirm-birthplace');
    const btnSame = birthCard.querySelector('#gcds-btn-same-village');
    assert.ok(manualInp, 'Manual birth place input exists');
    assert.ok(btnConfirm, 'Confirm button exists');
    assert.ok(btnSame, 'Same as current village button exists');

    // Operator enters manual birth village "Rampur"
    manualInp.value = 'Rampur';
    btnConfirm.click();
    await new Promise((r) => setTimeout(r, 30));

    // After operator confirmation, input#village is filled with Rampur
    assert.strictEqual(villInp.value, 'Rampur');
    assert.strictEqual(engine.sessionState.birthPlaceValue, 'Rampur');
    assert.strictEqual(engine.sessionState.birthPlaceManualConfirmed, true);

    // Declaration card should reflect Rampur
    const declCard = mockDocument.getElementById('gcds-declaration-card');
    assert.ok(declCard, 'Declaration card displayed');
    assert.ok(declCard.innerHTML.includes('Rampur'), 'Declaration card shows manual birth place Rampur');
    const btnConfirmDecl = declCard.querySelector('#gcds-btn-confirm-declaration');
    btnConfirmDecl.click();

    await declPromise;
  });

  await testAsync('Fallback button "Same as Current Village" works as expected in Scenario 2', async () => {
    engine.sessionState.lastSelectedRelationC = 'HSBN';
    engine.sessionState.lastSelectedRelationJ = null;
    engine.sessionState.birthPlaceManualConfirmed = false;
    engine.sessionState.birthPlaceValue = '';

    const mockData = {
      address: { village: 'Chandipur', state: 'WEST BENGAL', district: 'NORTH 24 PARGANAS' },
      address_since: '01-2015',
    };

    villInp.value = '';

    const declPromise = engine.handleSectionKDeclaration(mockData);

    const birthCard = mockDocument.getElementById('gcds-birthplace-card');
    assert.ok(birthCard, '#gcds-birthplace-card displayed');

    // Operator clicks "Same as Current Village"
    const btnSame = birthCard.querySelector('#gcds-btn-same-village');
    btnSame.click();
    await new Promise((r) => setTimeout(r, 30));

    assert.strictEqual(villInp.value, 'Chandipur');
    assert.strictEqual(engine.sessionState.birthPlaceValue, 'Chandipur');
    assert.strictEqual(engine.sessionState.birthPlaceManualConfirmed, true);

    const declCard = mockDocument.getElementById('gcds-declaration-card');
    const btnConfirmDecl = declCard.querySelector('#gcds-btn-confirm-declaration');
    btnConfirmDecl.click();
    await declPromise;
  });

  console.log('\n--- 4. Cleanup & CSS Verification ---');

  test('window.__GCDS_CONTENT_SCRIPT_CLEANUP removes #gcds-birthplace-card', () => {
    const dummyCard = new MockElement('div');
    dummyCard.id = 'gcds-birthplace-card';
    mockDocument.body.appendChild(dummyCard);
    assert.ok(mockDocument.getElementById('gcds-birthplace-card'));

    global.window.__GCDS_CONTENT_SCRIPT_CLEANUP();
    assert.strictEqual(mockDocument.getElementById('gcds-birthplace-card'), null);
  });

  test('content.js includes dedicated styles for #gcds-birthplace-card', () => {
    assert.ok(contentJs.includes('#gcds-birthplace-card'));
    assert.ok(contentJs.includes('.gcds-birth-input'));
    assert.ok(contentJs.includes('#gcds-btn-confirm-birthplace'));
  });

  console.log('\n================================================================');
  console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
})();

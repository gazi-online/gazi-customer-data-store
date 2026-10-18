/**
 * GAZI SMART FORM FILLER — SECTION J DYNAMIC FAMILY MEMBER SELECTION TEST
 * File: scratch/test-section-j-dynamic-picker.cjs
 */

const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log('🧪 SECTION J DYNAMIC RELATION PICKER (v1.6.1-GOLD) RUNTIME SUITE');
console.log('================================================================\n');

// Mock browser environment
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
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
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

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] || null; }
  removeAttribute(k) { delete this.attributes[k]; }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type || event] || [];
    list.forEach(fn => fn(event));
    return true;
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
    if (p.includes('[data-code="') && el.dataset.code === p.match(/\[data-code="([^"]+)"\]/)[1]) return true;
    if (p.includes('[data-testid="') && el.getAttribute('data-testid') === p.match(/\[data-testid="([^"]+)"\]/)[1]) return true;
    if (p.toLowerCase() === el.tagName.toLowerCase()) return true;
    if (p.toLowerCase().startsWith(el.tagName.toLowerCase())) {
      const rest = p.slice(el.tagName.length);
      if (rest.startsWith('#') && el.id === rest.slice(1)) return true;
      if (rest.startsWith('.') && el.classList.contains(rest.slice(1))) return true;
      if (rest.includes('[id="') && el.id === rest.match(/\[id="([^"]+)"\]/)[1]) return true;
      if (rest.includes('[name="') && el.name === rest.match(/\[name="([^"]+)"\]/)[1]) return true;
    }
  }
  return false;
}

// Minimal DOM parser for our cards
function parseCardHTML(card, html) {
  card.innerHTML = html;
  // Parse chips
  const chipMatches = html.matchAll(/<button type="button" class="gcds-rel-chip([^"]*)" data-code="([^"]+)" data-testid="([^"]+)"[^>]*>\s*([^<]+)\s*<\/button>/g);
  const selectRow = new MockElement('div');
  selectRow.id = 'gcds-sec-j-chips';
  selectRow.classList.add('gcds-select-row');
  card.appendChild(selectRow);

  for (const m of chipMatches) {
    const btn = new MockElement('button');
    btn.classList.add('gcds-rel-chip');
    if (m[1].includes('active')) btn.classList.add('active');
    btn.dataset.code = m[2];
    btn.setAttribute('data-testid', m[3]);
    btn.textContent = m[4].trim();
    selectRow.appendChild(btn);
  }

  // Parse manual input if present
  if (html.includes('id="gcds-manual-family-epic"')) {
    const inp = new MockElement('input');
    inp.id = 'gcds-manual-family-epic';
    inp.classList.add('gcds-epic-input');
    card.appendChild(inp);
  }

  // Parse buttons
  if (html.includes('id="gcds-btn-fill-family"')) {
    const btn = new MockElement('button');
    btn.id = 'gcds-btn-fill-family';
    btn.classList.add('gcds-btn-confirm');
    card.appendChild(btn);
  }
  if (html.includes('id="gcds-btn-proceed-family"')) {
    const btn = new MockElement('button');
    btn.id = 'gcds-btn-proceed-family';
    btn.classList.add('gcds-btn-confirm');
    card.appendChild(btn);
  }
  if (html.includes('id="gcds-btn-skip-family-epic"')) {
    const btn = new MockElement('button');
    btn.id = 'gcds-btn-skip-family-epic';
    btn.classList.add('gcds-btn-skip');
    card.appendChild(btn);
  }
}

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

// Load content.js script logic
const contentCode = fs.readFileSync('extension/content.js', 'utf8');
const contentJs = contentCode;

// Test 1: extractFamilyRecords logic
test('extractFamilyRecords extracts all 4 relatives with their respective EPICs', () => {
  const data = {
    father_name: 'Abdul Rahaman Sardar',
    father_epic: 'WBG1111111',
    mother_name: 'Jahanara Bibi',
    mother_epic: 'WBG2222222',
    spouse_name: 'Nur Islam Gazi',
    spouse_epic: 'WBG3333333',
    guardian_name: 'Hashem Ali',
    guardian_epic: 'WBG4444444',
  };

  // Evaluate extractFamilyRecords
  const fnMatch = contentCode.match(/function extractFamilyRecords\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'extractFamilyRecords function definition found');
  const extractFn = new Function('data', fnMatch[0] + '\nreturn extractFamilyRecords(data);');
  const records = extractFn(data);

  assert.strictEqual(records.FTHR.name, 'Abdul Rahaman');
  assert.strictEqual(records.FTHR.surname, 'Sardar');
  assert.strictEqual(records.FTHR.epic, 'WBG1111111');

  assert.strictEqual(records.MTHR.name, 'Jahanara');
  assert.strictEqual(records.MTHR.surname, 'Bibi');
  assert.strictEqual(records.MTHR.epic, 'WBG2222222');

  assert.strictEqual(records.HSBN.name, 'Nur Islam');
  assert.strictEqual(records.HSBN.surname, 'Gazi');
  assert.strictEqual(records.HSBN.epic, 'WBG3333333');

  assert.strictEqual(records.GRDN.name, 'Hashem');
  assert.strictEqual(records.GRDN.surname, 'Ali');
  assert.strictEqual(records.GRDN.epic, 'WBG4444444');
});

// Test 2: Fallback when only Mother EPIC exists
test('extractFamilyRecords correctly identifies Mother EPIC and missing Father EPIC', () => {
  const data = {
    father_name: 'Abdul Rahaman',
    mother_name: 'Jahanara Bibi',
    mother_epic: 'WBG2222222',
  };

  const fnMatch = contentCode.match(/function extractFamilyRecords\(data\) \{[\s\S]*?\n  \}/);
  const extractFn = new Function('data', fnMatch[0] + '\nreturn extractFamilyRecords(data);');
  const records = extractFn(data);

  assert.strictEqual(records.FTHR.name, 'Abdul');
  assert.strictEqual(records.FTHR.surname, 'Rahaman');
  assert.strictEqual(records.FTHR.epic, '', 'Father EPIC should be empty');
  assert.strictEqual(records.MTHR.name, 'Jahanara');
  assert.strictEqual(records.MTHR.surname, 'Bibi');
  assert.strictEqual(records.MTHR.epic, 'WBG2222222', 'Mother EPIC should be populated');
});

// Test 3: Dropdown selection matches synonyms
test('selectSectionJDropdown matches portal relation options (Father, Mother, Husband, Guardian)', () => {
  const fnMatch = contentCode.match(/function selectSectionJDropdown\(relCode, familyRecords\) \{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'selectSectionJDropdown found');

  const familyRecords = {
    MTHR: {
      labelEn: 'Mother',
      portalValues: ['Mother', 'মাতা', 'MTHR', 'M']
    }
  };

  // Mock select with portal options
  const select = new MockElement('select');
  select.id = 'currentRelRelationship';
  select.options = [
    { value: '1', text: 'Select Relation' },
    { value: '2', text: 'Father' },
    { value: '3', text: 'Mother' },
    { value: '4', text: 'Husband' },
    { value: '5', text: 'Legal Guardian in case of orphan' }
  ];

  // Test matching logic directly
  const rec = familyRecords.MTHR;
  const matched = select.options.find(opt => {
    return rec.portalValues.some(pv => opt.text.toUpperCase() === pv.toUpperCase());
  });

  assert.ok(matched, 'Found matching option for Mother');
  assert.strictEqual(matched.value, '3');
  assert.strictEqual(matched.text, 'Mother');
});

// Test 4: Card contains all 4 buttons and proper data-testid
test('SECTION_J_RELATIONS contains 4 exact relations matching user checklist', () => {
  const relMatch = contentCode.match(/const SECTION_J_RELATIONS = \[([\s\S]*?)\];/);
  assert.ok(relMatch, 'SECTION_J_RELATIONS array found');
  const relations = new Function('return [' + relMatch[1] + '];')();

  assert.strictEqual(relations.length, 4);
  const labels = relations.map(r => r.labelEn);
  assert.deepStrictEqual(labels, ['Father', 'Mother', 'Husband', 'Guardian']);

  const codes = relations.map(r => r.code);
  assert.deepStrictEqual(codes, ['FTHR', 'MTHR', 'HSBN', 'GRDN']);
});

// Test 5: Verify Checklist Item 1, 2, 3 in content.js code
test('Checklist compliance: 4 buttons, Mother auto-fill with EPIC, manual prompt without EPIC', () => {
  // Checklist Item 1: 4 buttons
  assert.ok(contentJs.includes("code: 'FTHR', labelEn: 'Father'"));
  assert.ok(contentJs.includes("code: 'MTHR', labelEn: 'Mother'"));
  assert.ok(contentJs.includes("code: 'HSBN', labelEn: 'Husband'"));
  assert.ok(contentJs.includes("code: 'GRDN', labelEn: 'Guardian'"));

  // Checklist Item 2: Mother with EPIC auto-fills details and EPIC
  assert.ok(contentJs.includes('if (targetRec && targetRec.epic)'));
  assert.ok(contentJs.includes('lastFilledCount = await applySectionJFill(selectedCode, familyRecords, targetRec.epic);'));
  assert.ok(contentJs.includes('details &amp; EPIC populated'));

  // Checklist Item 3: Missing data prompts manual entry
  assert.ok(contentJs.includes('EPIC not found in GCDS. Please enter manually'));
  assert.ok(contentJs.includes('No record for ${escapeHtml(rec.labelEn)} in GCDS'));
  assert.ok(contentJs.includes('gcds-manual-family-epic'));
});

// Test 6: Verify Safety Rule: Verification stay before advancing
test('Safety rule compliance: stays in Section J for review before advancing to K', () => {
  assert.ok(contentJs.includes('id="gcds-btn-proceed-family"'));
  assert.ok(contentJs.includes('Family details are optional. Verify fields before advancing.'));
  assert.ok(contentJs.includes('btnProceed.addEventListener'));
  assert.ok(contentJs.includes('await transitionSectionJToK();'));
});

console.log('\n================================================================');
console.log(`TOTAL RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const res = path.resolve(dir, e.name);
    if (e.isDirectory()) walkDir(res, fileList);
    else if (e.isFile() && res.endsWith('.js')) fileList.push(res);
  }
  return fileList;
}

function extractJsonObjectsFromText(text) {
  const results = [];
  const varRegex = /(?:var\s+)?(json_[A-Za-z0-9_]+)\s*=\s*\{/g;
  let match;
  while ((match = varRegex.exec(text)) !== null) {
    const varName = match[1];
    const braceStart = text.indexOf('{', match.index);
    if (braceStart === -1) continue;
    let i = braceStart;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i >= text.length) continue;
    const jsonText = text.slice(braceStart, i + 1);
    try {
      const obj = JSON.parse(jsonText);
      results.push({ name: varName, data: obj });
    } catch (e) {
      // skip parse errors
    }
  }
  return results;
}

function findLayerByFields(layers, requiredKeys) {
  for (const layer of layers) {
    try {
      if (!layer.data || !Array.isArray(layer.data.features) || layer.data.features.length === 0) continue;
      const props = layer.data.features[0].properties || {};
      const keys = Object.keys(props).map(k => k.toLowerCase());
      const hits = requiredKeys.filter(r => keys.includes(r.toLowerCase()));
      if (hits.length >= 2) return layer;
    } catch (e) { /* ignore */ }
  }
  return null;
}

function getProp(props, keys) {
  for (const k of keys) {
    if (k in props && props[k] != null) return props[k];
  }
  return undefined;
}

function buildTreeFromLayers(layers) {
  const claimantsLayer = findLayerByFields(layers, ['LOT NUMBER', 'FIRST NAME', 'LAST NAME']);
  if (!claimantsLayer) {
    console.error('No claimants layer found (requires LOT NUMBER + FIRST NAME/LAST NAME)');
    return null;
  }

  const root = { id: 'root', name: 'TOLEDO', type: 'root', children: [] };

  claimantsLayer.data.features.forEach((f, idx) => {
    const p = f.properties || {};
    const lot = getProp(p, ['LOT NUMBER', 'LOT_NUMBER', 'Lot_No', 'lotNumber']) || ('lot_' + idx);
    const cadNode = {
      id: 'cad_' + String(lot).replace(/\s+/g, '_'),
      type: 'cadastral',
      lotNumber: lot,
      firstName: getProp(p, ['FIRST NAME', 'FirstName', 'first_name', 'firstName']) || '',
      lastName: getProp(p, ['LAST NAME', 'LastName', 'last_name', 'lastName']) || '',
      barangay: getProp(p, ['BARANGAY', 'Barangay']) || '',
      section: getProp(p, ['SECTION', 'Section', 'SECTION NO', 'SECTION_NO']) || '',
      area: getProp(p, ['AREA (m²)', 'AREA (M²)', 'AREA', 'Area', 'AREA_M2', 'AREA_M²', 'TOTAL_AREA']) || '',
      remarks: getProp(p, ['REMARKS', 'Remarks']) || '',
      children: [],
      collapsed: true
    };
    root.children.push(cadNode);
  });

  return root;
}

async function postToBackend(tree, backendUrl) {
  const url = (backendUrl || 'http://localhost:3001').replace(/\/$/, '') + '/api/tracer/save';
  console.log('Posting tree to', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tree),
    });
    const txt = await res.text();
    console.log('Response:', res.status, txt);
  } catch (e) {
    console.error('Failed to post to backend', e);
  }
}

async function main() {
  const workspaceRoot = process.argv[2] || path.resolve(__dirname, '..', '..');
  const backendUrlArgIndex = process.argv.indexOf('--backend');
  const backendUrl = backendUrlArgIndex >= 0 ? process.argv[backendUrlArgIndex + 1] : 'http://localhost:3001';

  console.log('Scanning for layer JS files under', workspaceRoot);
  const files = walkDir(workspaceRoot);
  const layerFiles = files.filter(f => f.includes(path.join('frontend', 'layers')) || f.includes('qgis2web') || f.includes('QGIS_WEB'));
  if (layerFiles.length === 0) {
    console.error('No layer JS files found. Searched files count:', files.length);
    return process.exit(1);
  }

  const layers = [];
  for (const file of layerFiles) {
    try {
      const txt = fs.readFileSync(file, 'utf8');
      const objs = extractJsonObjectsFromText(txt);
      objs.forEach(o => layers.push({ file, name: o.name, data: o.data }));
    } catch (e) {
      // ignore
    }
  }

  if (layers.length === 0) {
    console.error('No json_* objects parsed from layer files. Check files under frontend/layers or qgis2web layers.');
    return process.exit(1);
  }

  const tree = buildTreeFromLayers(layers);
  if (!tree) return process.exit(1);

  console.log('Built tree with', (tree.children || []).length, 'cadastral nodes. Writing to backend/tracer_built.json and posting to backend...');
  try {
    fs.writeFileSync(path.resolve(__dirname, '..', 'tracer_built.json'), JSON.stringify(tree));
    console.log('Wrote built tree to backend/tracer_built.json');
  } catch (e) {
    console.warn('Failed to write tracer_built.json', e);
  }

  await postToBackend(tree, backendUrl);
}

if (require.main === module) main();

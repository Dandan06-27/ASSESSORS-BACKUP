/**
 * Tracer - Cadastral Org Chart Interactive Handler
 * Handles line behavior, interactivity, pan/zoom, search, and node management
 */

// Utility function to get property value from object with fallback keys
function getProp(props, keys) {
  for (const k of keys) {
    if (k in props && props[k] != null) return props[k];
  }
  return undefined;
}

function getNodeValue(node, key) {
  if (!node || !key) return undefined;
  if (key in node && node[key] !== undefined) return node[key];
  const lowerKey = String(key).toLowerCase();
  for (const prop of Object.keys(node)) {
    if (prop.toLowerCase() === lowerKey) return node[prop];
  }
  return undefined;
}

function createFuseNode(config = {}) {
  const type = config && config.type ? config.type : 'node';
  const node = {
    id: config && config.id ? config.id : `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    children: [],
    ...config,
  };
  if (config && config.fid != null && node.FID == null) node.FID = config.fid;
  if (config && config.FID != null && node.fid == null) node.fid = config.FID;

  if (!Array.isArray(node.children)) node.children = [];
  if (node.type === 'root' && !node.name) node.name = 'TOLEDO';
  if (node.type === 'cadastral' && typeof node.collapsed === 'undefined') node.collapsed = true;
  return node;
}

function appendFuseChild(parentNode, childNode) {
  if (!parentNode || typeof parentNode !== 'object') return null;
  if (!Array.isArray(parentNode.children)) parentNode.children = [];
  const child = createFuseNode(childNode);
  parentNode.children.push(child);
  return child;
}

function createFuseTree(rootName = 'TOLEDO') {
  return createFuseNode({ id: 'root', type: 'root', name: rootName, children: [] });
}

function getBarangayCode(name) {
  if (!name) return '';
  let n = String(name).toUpperCase().trim();
  // remove parenthetical annotations like "(Lutopan)"
  n = n.replace(/\(.*\)/g, '').trim();
  n = n.replace(/[\u2019\u2018\u201C\u201D]/g, "'");
  // normalize some common variants
  n = n.replace(/\bCAMP\b/g, 'CAMPO');
  n = n.replace(/\bCAPITAN\b/g, 'CAPT');
  n = n.replace(/\bCAPTAIN\b/g, 'CAPT');

  // canonical map (source codes remain unchanged)
  const map = {
    'POBLACION': '001', 'AWIHAO': '002', 'BAGAKAY': '003', 'BATO': '004', 'BIGA': '005', 'BULONGAN': '006', 'BUNGA': '007', 'CABITOONAN': '008', 'CALONGCALONG': '009', 'CAMBANGUG': '010', 'CAMPO 8': '011', 'CANLULAMPAO': '012', 'CANTABACO': '013', 'CAPT. CLAUDIO': '014', 'CARMEN': '015', 'DAS': '016', 'DUMLOG': '017', 'GEN. CLIMACO': '018', 'IBO': '019', 'ILIHAN': '020', 'LANDAHAN': '021', 'LOAY': '022', 'LURAY II': '023', 'MAGDUGO': '024', 'MATAB-ANG': '025', 'MEDIA-ONCE': '026', 'PANGAMIHAN': '027', 'POOG': '028', 'PUTINGBATO': '029', 'SAGAY': '030', 'SAM-ANG': '031', 'SANGI': '032', 'STO, NIÑO': '033', 'STO NINO': '033', 'SUBAYON': '034', 'TALAVERA': '035', 'TUBOD': '036', 'TUNGKAY': '037', 'DAANLUNGSOD': '038'
  };

  // normalizer used for map keys and input
  function normalizeKey(s) {
    return String(s || '').toUpperCase().replace(/\(.*\)/g, '').replace(/[\u2019\u2018\u201C\u201D]/g, "'").replace(/\bCAMP\b/g, 'CAMPO').replace(/\bCAPITAN\b/g, 'CAPT').replace(/\bCAPTAIN\b/g, 'CAPT').replace(/[^A-Z0-9 ]+/g, '').trim();
  }

  const clean = normalizeKey(n);

  // build normalized lookup (must exist before any alias checks)
  const normalizedMap = {};
  Object.keys(map).forEach(k => {
    normalizedMap[normalizeKey(k)] = map[k];
  });

  // explicit alias entries for known variants that appear in the UI
  const aliasToCanonical = {
    'CANLUMAMPAO': 'CANLULAMPAO',
    'CANLUMAMP AO': 'CANLULAMPAO',
    'DAANGLUNGSOD': 'DAANLUNGSOD',
    'DONANDRESSORIANO': 'DAS',
    'DONANDRESSORIANO LUTOPAN': 'DAS',
    'ANDRESSORIANO': 'DAS'
  };
  Object.entries(aliasToCanonical).forEach(([a, canonical]) => {
    const na = normalizeKey(a);
    const nc = normalizeKey(canonical);
    if (normalizedMap[nc]) normalizedMap[na] = normalizedMap[nc];
  });

  // quick aliases for known problematic variants (handle misspellings and token variants)
  const compact = clean.replace(/[^A-Z0-9]/g, '');

  // Canlumampao variants: CANLULAMPAO, CANLUMAMP A O, CANLUMAMPAO, etc.
  if (/CANLU?L?AM?PA?O?/.test(compact) || /CANLUMAMPAO|CANLULAMPAO/.test(compact)) {
    return normalizedMap[normalizeKey('CANLULAMPAO')];
  }

  // Daanglungsod variants
  if (compact.includes('DAANLUNGSOD') || /DAANGLUNGSOD|DAANLUNGSOD/.test(compact)) {
    return normalizedMap[normalizeKey('DAANLUNGSOD')];
  }

  // Don Andres Soriano variants and DAS lutopan entries
  const nUpper = n.toUpperCase();
  if (nUpper.includes('DON') && nUpper.includes('ANDRES') && nUpper.includes('SORIANO')) {
    return normalizedMap[normalizeKey('DAS')];
  }
  if (nUpper.includes('SORIANO') || nUpper.includes('LUTOPAN') || compact === 'DAS') {
    return normalizedMap[normalizeKey('DAS')];
  }

  // exact normalized match
  if (normalizedMap[clean]) return normalizedMap[clean];

  // compact forms for fuzzy matching
  const compactInput = clean.replace(/[^A-Z0-9]/g, '');
  for (const nk in normalizedMap) {
    const compactKey = nk.replace(/[^A-Z0-9]/g, '');
    if (!compactInput || !compactKey) continue;
    if (compactKey === compactInput) return normalizedMap[nk];
    if (compactKey.includes(compactInput) || compactInput.includes(compactKey)) return normalizedMap[nk];
    // token-based partial match
    const tokens = clean.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (nk.indexOf(t) !== -1 || nk.replace(/[^A-Z0-9]/g, '').indexOf(t.replace(/[^A-Z0-9]/g, '')) !== -1) return normalizedMap[nk];
    }
  }

  return '';
}

function fillRecordBarangays(list) {
  if (!barangaySelect) return;
  barangaySelect.innerHTML = '<option value="">Select barangay</option>';
  (list || []).forEach(b => {
    const option = document.createElement('option');
    option.value = b;
    option.textContent = b;
    barangaySelect.appendChild(option);
  });
}

function fillRecordClassifications(classifications) {
  if (!classificationSelect) return;
  classificationSelect.innerHTML = '<option value="">Select classification</option>';
  if (!classifications || typeof classifications !== 'object') return;
  Object.entries(classifications).forEach(([code, label]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = String(label || code);
    classificationSelect.appendChild(option);
  });
}

function tryLoadSystemConfig() {
  if (!window.fetch) return;
  fetch('/api/system/config').then(res => {
    if (!res.ok) throw new Error('no config');
    return res.json();
  }).then(cfg => {
    fillRecordBarangays(cfg && cfg.barangays ? cfg.barangays : []);
    fillRecordClassifications(cfg && cfg.classifications ? cfg.classifications : {});
  }).catch(() => {
    fillRecordBarangays([
      'POBLACION','AWIHAO','BAGAKAY','BATO','BIGA','BULONGAN','BUNGA','CABITOONAN','CALONG-CALONG','CAMBANG-UG','CAMPO 8','CANLULAMPAO','CANTABACO','CAPT. CLAUDIO','CARMEN','DAS','DUMLOG','GEN. CLIMACO','IBO','ILIHAN','LANDAHAN','LOAY','LURAY II','MAGDUGO','MATAB-ANG','MEDIA-ONCE','PANGAMIHAN','POOG','PUTINGBATO','SAGAY','SAM-ANG','SANGI','STO, NIÑO','STO NINO','SUBAYON','TALAVERA','TUBOD','TUNGKAY','DAANLUNGSOD'
    ]);
    fillRecordClassifications({});
  });
}

// Find layer by required fields
function findLayerByFields(requiredKeys) {
  const candidates = Object.keys(window).filter(k => k.startsWith('json_'));
  for (const name of candidates) {
    try {
      const layer = window[name];
      if (!layer || !Array.isArray(layer.features) || !layer.features.length) continue;
      const props = layer.features[0].properties || {};
      const keys = Object.keys(props).map(x => x.toLowerCase());
      const hits = requiredKeys.filter(r => keys.includes(r.toLowerCase()));
      if (hits.length >= 2) return layer;
    } catch (e) {
      /*ignore*/
    }
  }
  return null;
}

// Build org data from available layers
function buildFromLayer() {
  const claimantsLayer = findLayerByFields(['LOT NUMBER', 'FIRST NAME', 'LAST NAME']);
  const parcelsLayer = window.json_TOLEDOPARCELS_0 || findLayerByFields(['PIN', 'PARCEL NO', 'Assessors Data_PARCEL NO']);

  if (!claimantsLayer) return null;

  const root = createFuseTree('TOLEDO');

  claimantsLayer.features.forEach((f, idx) => {
    const p = f.properties || {};
    const lot = getProp(p, ['LOT NUMBER', 'LOT_NUMBER', 'Lot_No', 'lotNumber']) || ('lot_' + idx);
    const cadNode = createFuseNode({
      id: 'cad_' + String(lot).replace(/\s+/g, '_'),
      type: 'cadastral',
      lotNumber: lot,
      firstName: getProp(p, ['FIRST NAME', 'FirstName', 'first_name', 'firstName']) || '',
      lastName: getProp(p, ['LAST NAME', 'LastName', 'last_name', 'lastName']) || '',
      barangay: getProp(p, ['BARANGAY', 'Barangay']) || '',
      section: getProp(p, ['SECTION', 'Section', 'SECTION NO', 'SECTION_NO']) || '',
      area: getProp(p, ['AREA (m²)', 'AREA (M²)', 'AREA', 'Area', 'AREA_M2', 'AREA_M²', 'TOTAL_AREA']) || '',
      remarks: getProp(p, ['REMARKS', 'Remarks']) || '',
      collapsed: true,
    });

    appendFuseChild(root, cadNode);
  });

  return root;
}

const STORAGE_KEY = 'tracerOrgData';

function isValidOrgData(data) {
  return data && typeof data === 'object' && data.id === 'root' && Array.isArray(data.children);
}

function getTracerApiBaseUrl() {
  const configured = (window.__TRACER_API_BASE__ || '').toString().trim();
  if (configured) return configured.replace(/\/$/, '');

  if (window.location && window.location.origin) {
    const { protocol, hostname } = window.location;
    const currentOrigin = `${protocol}//${hostname}`;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return `${currentOrigin}:3001`;
    }
    return window.location.origin;
  }

  return 'http://localhost:3001';
}

function getTracerApiUrl(path) {
  const base = getTracerApiBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function getTracerAuthToken() {
  try {
    return localStorage.getItem('landbook_token') || '';
  } catch (e) {
    return '';
  }
}

async function createTracerRecord(recordPayload) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getTracerAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(getTracerApiUrl('/api/records'), {
    method: 'POST',
    headers,
    body: JSON.stringify(recordPayload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Unable to save record');
  }

  return data;
}

async function deleteTracerRecord(recordId) {
  if (!recordId) return null;
  const headers = {};
  const token = getTracerAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(getTracerApiUrl(`/api/records/${recordId}`), {
    method: 'DELETE',
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Unable to delete record');
  }

  return data;
}

function loadSavedOrgData() {
  // Try synchronous request to backend endpoint (falls back to localStorage)
  try {
    if (window.XMLHttpRequest) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', getTracerApiUrl('/api/tracer/load'), false);
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
          const remote = JSON.parse(xhr.responseText);
          if (isValidOrgData(remote)) return remote;
        }
      } catch (e) {
        // ignore and fallback to localStorage
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (isValidOrgData(saved)) return saved;
  } catch (e) {
    console.warn('Unable to load saved tracer data', e);
  }
  return null;
}

function saveOrgData() {
  try {
    const payload = JSON.stringify(ORG_DATA);
    localStorage.setItem(STORAGE_KEY, payload);
    try {
      const backup = localStorage.getItem('tracerOrgDataBackup') || '';
      if (backup !== payload) {
        localStorage.setItem('tracerOrgDataBackup', payload);
      }
    } catch (e) {
      console.warn('Unable to update tracer backup in localStorage', e);
    }
  } catch (e) {
    console.warn('Unable to save tracer data', e);
  }

  const apiUrl = getTracerApiUrl('/api/tracer/save');

  // Post update to backend (async) — best-effort
  if (window.fetch) {
    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ORG_DATA),
      }).catch((err) => console.warn('Unable to persist tracer data to server', err));
    } catch (e) {
      console.warn('Unable to persist tracer data to server', e);
    }
  } else if (window.XMLHttpRequest) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(ORG_DATA));
    } catch (e) {
      console.warn('Unable to persist tracer data to server', e);
    }
  }
}

// Initialize data
const savedData = loadSavedOrgData();
const built = savedData || buildFromLayer();
const ORG_DATA = built || (() => {
  const root = createFuseTree('TOLEDO');
  const cadastral = createFuseNode({
    id: 'cad_3086', type: 'cadastral', lotNumber: '3086', lastName: 'Canillo', firstName: 'Victorino',
    barangay: 'Bato', section: '2', area: '551 sqm', remarks: 'AR', collapsed: true
  });
  appendFuseChild(root, cadastral);
  appendFuseChild(cadastral, createFuseNode({
    id: 'par_1', type: 'parcel', FID: 1, PIN: '149-00-004-02-029', SERVER_PIN: '149-00-0004-02-029-0000',
    NEW_PIN: null, BARANGAY: 'Bato', SECTION_NO: '2', CADASTRAL_SURVEY_NO: '3086', TITLE_NO: 'NULL',
    DECLARATION_NO: '7201', PARCEL_NO: '29', DISPLAY_NAME: 'Victorino Canillo',
    OWNER_ADDRESS: 'Bato, Toledo City', TOTAL_AREA: '551', DATA_UNIT: 'sqm',
    TOTAL_MARKET_VALUE: '137750', TOTAL_ASSESSED_VALUE: '13780', CLASSIFICATION: 'AR'
  }));
  return root;
})();

// DOM References
const chart = document.getElementById('chart');
const searchInput = document.getElementById('searchInput');
const sidebar = document.getElementById('sidebar');
const details = document.getElementById('details');
const sidebarFooter = document.getElementById('sidebarFooter');
const tracerPrintBtn = document.getElementById('tracer-print');
const addPartitionSidebarBtn = document.getElementById('addPartitionSidebarBtn');
const addPartitionModal = document.getElementById('addPartitionModal');
const addPartitionForm = document.getElementById('addPartitionForm');
const cancelAddPartitionBtn = document.getElementById('cancelAddPartitionBtn');
const barangaySelect = document.getElementById('record-barangay');
const classificationSelect = document.getElementById('record-classification');
const wrap = document.getElementById('chart-wrap');
let activeSidebarNode = null;
let pendingFuseNode = null;
let pendingFuseTargetNode = null;

// Transform state
let transform = { x: 0, y: 0, scale: 1 };
let pointer = { down: false, x: 0, y: 0 };

// Viewport rendering state
const VIEWPORT_PADDING = 200; // Extra space to render beyond visible area
let visibleNodes = new Set(); // Track which nodes are currently visible
let nodePositions = new Map(); // Cache calculated positions
let currentSearchQuery = ''; // Track active search query

// Debounce/throttle for expensive operations
let redrawTimeout;
let resizeTimeout;

/**
 * Schedule a connector line redraw with debouncing
 */
function scheduleRedraw() {
  clearTimeout(redrawTimeout);
  redrawTimeout = setTimeout(() => {
    drawConnectorLines();
  }, 100);
}

// Create SVG container for connector lines (will be inserted after chart renders)
let svgContainer;

// ============================================================================
// RENDERING & DOM CREATION
// ============================================================================

/**
 * Calculate viewport bounds in chart space
 * Takes into account pan offset without moving nodes visually
 */
function getViewportBounds() {
  const wrapRect = wrap.getBoundingClientRect();
  
  // Viewport is centered, pan offset determines what's visible
  const viewportX = -transform.x / transform.scale;
  const viewportY = -transform.y / transform.scale;
  const viewportWidth = wrapRect.width / transform.scale;
  const viewportHeight = wrapRect.height / transform.scale;
  
  return {
    left: viewportX - VIEWPORT_PADDING,
    top: viewportY - VIEWPORT_PADDING,
    right: viewportX + viewportWidth + VIEWPORT_PADDING,
    bottom: viewportY + viewportHeight + VIEWPORT_PADDING
  };
}

/**
 * Check if a node would be visible in the viewport
 * Estimates node position based on tree structure
 */
function isNodeInViewport(node, depth = 0, xPos = 0) {
  const bounds = getViewportBounds();
  
  // Rough estimate of node position (horizontal)
  // Cards are spaced approximately 280px apart
  const estimatedWidth = 280;
  const horizontalSpacing = 80;
  
  // Estimate y position based on depth
  const nodeHeight = 120; // card height + gap
  const estimatedY = depth * nodeHeight;
  
  // Check if node is in viewport bounds
  const isVisible = (
    xPos < bounds.right &&
    xPos + estimatedWidth > bounds.left &&
    estimatedY < bounds.bottom &&
    estimatedY + nodeHeight > bounds.top
  );
  
  return isVisible;
}

/**
 * Filter tree to only include nodes in viewport
 * Recursively culls branches outside visible area
 */
function filterVisibleNodes(node, depth = 0, xPos = 0) {
  // Always include root
  if (node.id === 'root') {
    const filteredChildren = [];
    const childCount = node.children?.length || 1;
    let childXPos = -((childCount - 1) * 150);
    
    if (node.children) {
      node.children.forEach(child => {
        const filtered = filterVisibleNodes(child, depth + 1, childXPos);
        if (filtered) filteredChildren.push(filtered);
        childXPos += 300;
      });
    }
    
    return filteredChildren.length > 0 
      ? { ...node, children: filteredChildren }
      : node;
  }
  
  // For non-root nodes, check if in viewport
  if (!isNodeInViewport(node, depth, xPos)) {
    return null;
  }
  
  // Include this node and filter its children
  const filteredChildren = [];
  let childXPos = xPos - ((node.children?.length || 1) * 150);
  
  if (node.children) {
    node.children.forEach(child => {
      const filtered = filterVisibleNodes(child, depth + 1, childXPos);
      if (filtered) filteredChildren.push(filtered);
      childXPos += 300;
    });
  }
  
  return {
    ...node,
    children: filteredChildren.length > 0 ? filteredChildren : []
  };
}

/**
 * Main render function - builds the entire tree with viewport culling
 */
function applyFuseVisualState() {
  document.querySelectorAll('.card.fuse-marked').forEach(card => card.classList.remove('fuse-marked'));
  if (!pendingFuseNode) return;

  const markedCard = document.querySelector(`[data-node-id="${pendingFuseNode.id}"] .card`);
  if (markedCard) {
    markedCard.classList.add('fuse-marked');
  }

  if (activeSidebarNode && activeSidebarNode.id === pendingFuseNode.id) {
    const selectedCard = document.querySelector(`[data-node-id="${activeSidebarNode.id}"] .card`);
    selectedCard?.classList.add('selected');
  }
}

function render() {
  chart.innerHTML = '';
  
  // Create SVG container for lines
  svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgContainer.setAttribute('id', 'connector-lines');
  svgContainer.setAttribute('style', 'position:absolute;top:0;left:0;pointer-events:none;z-index:0;overflow:visible;');
  chart.appendChild(svgContainer);
  
  // Start with full data or search-filtered data
  let dataToRender = ORG_DATA;
  let filteredData = null;
  
  // If there's an active search query, apply search filter first
  if (currentSearchQuery) {
    const searchFiltered = filterNodes(ORG_DATA, currentSearchQuery);
    dataToRender = searchFiltered || ORG_DATA;
    filteredData = dataToRender;
  } else {
    // Then apply viewport culling when not searching
    filteredData = filterVisibleNodes(dataToRender);
  }
  
  if (filteredData) {
    const ul = createNodeElement(filteredData);
    ul.classList.add('tree');
    chart.appendChild(ul);
  }

  requestAnimationFrame(() => {
    applyFuseVisualState();
  });
  
  // Redraw connector lines with debouncing
  scheduleRedraw();
}

/**
 * Draw SVG connector lines between parent and child nodes
 * Calculates actual positions to ensure lines connect properly
 * Optimized for performance
 */
function drawConnectorLines() {
  if (!svgContainer) return;
  
  // Clear previous lines
  svgContainer.innerHTML = '';
  
  // Get all cards to find the actual bounds - do this once
  const allCards = document.querySelectorAll('.card');
  if (allCards.length === 0) return;
  
  const chartRect = chart.getBoundingClientRect();
  
  // Calculate bounds of all content
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  allCards.forEach(card => {
    const rect = card.getBoundingClientRect();
    const cardX = rect.left - chartRect.left;
    const cardY = rect.top - chartRect.top;
    
    minX = Math.min(minX, cardX);
    maxX = Math.max(maxX, cardX + rect.width);
    minY = Math.min(minY, cardY);
    maxY = Math.max(maxY, cardY + rect.height);
  });
  
  // Add padding around bounds
  const padding = 50;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  
  const svgWidth = maxX - minX + padding * 2;
  const svgHeight = maxY - minY + padding * 2;
  
  // Set SVG dimensions and position
  svgContainer.setAttribute('width', svgWidth);
  svgContainer.setAttribute('height', svgHeight);
  svgContainer.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svgContainer.style.left = minX + 'px';
  svgContainer.style.top = minY + 'px';
  
  // Build a document fragment to batch DOM updates
  const fragment = document.createDocumentFragment();
  
  // Get all node-children containers - cache the query
  const childContainers = document.querySelectorAll('.node-children');
  
  childContainers.forEach(childContainer => {
    const parentCard = childContainer.parentElement?.querySelector('.card');
    if (!parentCard) return;
    
    // Get positions relative to SVG origin
    const parentRect = parentCard.getBoundingClientRect();
    const parentX = (parentRect.left - chartRect.left) - minX + parentRect.width / 2;
    const parentY = (parentRect.top - chartRect.top) - minY + parentRect.height;
    
    // Get all child cards in this container
    const childCards = childContainer.querySelectorAll(':scope > .node > .card');
    
    childCards.forEach(childCard => {
      const childRect = childCard.getBoundingClientRect();
      if (!childRect.width || !childRect.height) return;
      const childX = (childRect.left - chartRect.left) - minX + childRect.width / 2;
      const childY = (childRect.top - chartRect.top) - minY;
      
      // Calculate the midpoint for the connector
      const midY = (parentY + childY) / 2;
      
      // Create path for the connector line
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${parentX} ${parentY} L ${parentX} ${midY} L ${childX} ${midY} L ${childX} ${childY}`);
      path.setAttribute('stroke', 'rgba(99, 102, 241, 0.34)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      
      fragment.appendChild(path);
    });
  });
  
  // Batch append all paths at once
  svgContainer.appendChild(fragment);
}

/**
 * Create DOM element for a tree node with all interactive features
 * Includes connector lines via CSS (::before, ::after on node-children)
 */
function createFuseNodeElement(node) {
  const li = document.createElement('div');
  li.className = 'node fade';
  li.setAttribute('data-node-id', node.id);

  // Card element
  const card = document.createElement('div');
  card.className = 'card';

  // Toggle button for nodes with children
  if (node.children && node.children.length) {
    const t = document.createElement('div');
    t.className = 'node-toggle';
    t.textContent = '▾';
    t.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      li.classList.toggle('collapsed');
      scheduleRedraw();
    };
    card.appendChild(t);
    if (node.type === 'cadastral' && node.collapsed !== false) {
      li.classList.add('collapsed');
    }
  }
  const title = document.createElement('div');
  title.className = 'title';
  const sub = document.createElement('div');
  sub.className = 'sub';

  // Populate card content based on node type
  if (node.type === 'cadastral') {
    title.textContent = node.lotNumber || 'Cadastral';
    sub.textContent = (node.lastName ? node.lastName + ', ' + (node.firstName || '') : node.name || '');
  } else if (node.type === 'parcel') {
    title.textContent = node.PIN || node.DISPLAY_NAME || 'Parcel';
    sub.textContent = node.DISPLAY_NAME || node.PIN;
  } else if (node.type === 'blank') {
    card.classList.add('blank-card');
    title.textContent = node.name || 'New node';
    sub.textContent = node.name ? '' : 'Click to edit details';
  } else {
    title.textContent = node.name || 'Root';
    sub.textContent = '';
  }

  card.appendChild(title);
  if (Array.isArray(node.fusedFrom) && node.fusedFrom.length > 0) {
    const fusedBadge = document.createElement('div');
    fusedBadge.className = 'fused-indicator';
    fusedBadge.textContent = 'Fused Node';
    card.appendChild(fusedBadge);
  }
  card.appendChild(sub);

  // Add button (for nodes with < 2 children)
  const childCount = node.children ? node.children.length : 0;
  if (childCount < 2) {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.type = 'button';
    addBtn.innerHTML = '+';
    addBtn.title = 'Add nodes';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      const actualNode = findNodeById(ORG_DATA, node.id) || node;
      insertBlankChildren(actualNode);
    };
    card.appendChild(addBtn);
  }

  // Delete button (for non-root nodes)
  if (node.id !== 'root') {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '−';
    deleteBtn.title = 'Delete node';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      showDeleteModal(node);
    };
    card.appendChild(deleteBtn);
  }

  // Click handler to show details
  card.onclick = (e) => {
    e.stopPropagation();
    showDetails(node);
  };

  li.appendChild(card);

  // Children container (connector lines are drawn via CSS ::before and ::after)
  if (node.children && node.children.length) {
    const childWrap = document.createElement('div');
    childWrap.className = 'node-children';
    node.children.forEach(c => {
      const child = createFuseNodeElement(c);
      childWrap.appendChild(child);
    });
    li.appendChild(childWrap);
  }

  return li;
}

const createNodeElement = createFuseNodeElement;

// ============================================================================
// NODE MANAGEMENT
// ============================================================================

/**
 * Insert blank child nodes
 */
function insertBlankChildren(parentNode) {
  if (!parentNode.children) parentNode.children = [];
  appendFuseChild(parentNode, { id: `${parentNode.id}_new_1`, type: 'blank', name: '', children: [] });
  appendFuseChild(parentNode, { id: `${parentNode.id}_new_2`, type: 'blank', name: '', children: [] });
  parentNode.collapsed = false;
  saveOrgData();
  render();
}

/**
 * Delete node by id (recursive search)
 */
function deleteNodeById(parent, nodeId) {
  if (!parent.children) return false;
  const idx = parent.children.findIndex(child => child.id === nodeId);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
    return true;
  }
  return parent.children.some(child => deleteNodeById(child, nodeId));
}

function findNodeById(node, nodeId) {
  if (!node) return null;
  if (node.id === nodeId) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
}

/**
 * Delete a node (unless it's root)
 */
async function deleteNode(node) {
  if (!node || node.id === 'root') return;

  if (node.type === 'parcel' && node.recordId) {
    try {
      await deleteTracerRecord(node.recordId);
    } catch (error) {
      console.warn('Unable to delete tracer parcel record', error);
    }
  }

  deleteNodeById(ORG_DATA, node.id);
  saveOrgData();
  render();
}

let pendingDeleteNode = null;

function showDeleteModal(node) {
  pendingDeleteNode = node;
  const modal = document.getElementById('deleteModal');
  const input = document.getElementById('deletePasskeyInput');
  const error = modal.querySelector('.error');
  input.value = '';
  error.textContent = '';
  modal.classList.remove('hidden');
}

function hideDeleteModal() {
  const modal = document.getElementById('deleteModal');
  modal.classList.add('hidden');
  pendingDeleteNode = null;
}

function confirmDeleteNode(event) {
  event.preventDefault();
  const value = document.getElementById('deletePasskeyInput').value.trim();
  const error = document.querySelector('#deleteModal .error');
  if (value !== 'passkey') {
    error.textContent = 'Invalid passkey';
    return;
  }
  if (pendingDeleteNode) {
    deleteNode(pendingDeleteNode);
  }
  hideDeleteModal();
}

// ============================================================================
// DETAILS SIDEBAR
// ============================================================================

/**
 * Show node details in sidebar
 */
function getNodeDisplayLabel(node) {
  if (!node) return 'node';
  if (node.type === 'parcel') {
    return node.DISPLAY_NAME || node.PIN || node.name || 'Parcel';
  }
  if (node.type === 'cadastral') {
    return node.lotNumber || [node.lastName, node.firstName].filter(Boolean).join(', ') || node.name || 'Cadastral';
  }
  return node.name || node.lotNumber || node.PIN || node.id || 'Node';
}

function refreshFuseButtonLabel() {
  const button = document.getElementById('fuseNodeSidebarBtn');
  if (!button) return;
  if (!pendingFuseNode) {
    button.textContent = 'Mark for fuse';
    return;
  }
  const currentNode = activeSidebarNode || getSelectedSidebarNode();
  if (currentNode && currentNode.id === pendingFuseNode.id) {
    button.textContent = 'Cancel Mark Fusing';
  } else {
    button.textContent = `Fuse with ${getNodeDisplayLabel(pendingFuseNode)}`;
  }
}

function findParentNode(root, nodeId, parent = null) {
  if (!root || !root.children) return null;
  for (const child of root.children) {
    if (child.id === nodeId) {
      return { parent: root, child };
    }
    const nested = findParentNode(child, nodeId, root);
    if (nested) return nested;
  }
  return null;
}

function fuseNodes(primaryNode, secondaryNode) {
  if (!primaryNode || !secondaryNode) return false;
  if (primaryNode.id === secondaryNode.id) return false;
  if (primaryNode.id === 'root' || secondaryNode.id === 'root') return false;

  const parentInfo = findParentNode(ORG_DATA, secondaryNode.id);
  if (!parentInfo) return false;

  if (!Array.isArray(primaryNode.children)) primaryNode.children = [];
  if (!Array.isArray(secondaryNode.children)) secondaryNode.children = [];

  primaryNode.children = primaryNode.children.concat(secondaryNode.children);
  const mergeFields = ['name', 'lotNumber', 'firstName', 'lastName', 'barangay', 'section', 'area', 'remarks', 'PIN', 'DISPLAY_NAME', 'SERVER_PIN', 'NEW_PIN', 'BARANGAY', 'SECTION_NO', 'CADASTRAL_SURVEY_NO', 'TITLE_NO', 'DECLARATION_NO', 'PARCEL_NO', 'OWNER_ADDRESS', 'TOTAL_AREA', 'DATA_UNIT', 'TOTAL_MARKET_VALUE', 'TOTAL_ASSESSED_VALUE', 'CLASSIFICATION'];
  mergeFields.forEach((field) => {
    if ((!primaryNode[field] && primaryNode[field] !== 0) && (secondaryNode[field] || secondaryNode[field] === 0)) {
      primaryNode[field] = secondaryNode[field];
    }
  });

  if (!primaryNode.type || primaryNode.type === 'blank') primaryNode.type = secondaryNode.type || primaryNode.type;
  // record fused history on the resulting primary node (keep copies of both sources)
  try {
    const snapA = JSON.parse(JSON.stringify(primaryNode));
    const snapB = JSON.parse(JSON.stringify(secondaryNode));
    primaryNode.fusedFrom = (primaryNode.fusedFrom || []).concat([snapA, snapB]);
  } catch (e) {
    // ignore serialization errors
  }

  parentInfo.parent.children = parentInfo.parent.children.filter((child) => child.id !== secondaryNode.id);
  pendingFuseNode = null;
  saveOrgData();
  render();
  showDetails(primaryNode);
  return true;
}

function collectFuseHistory(node) {
  if (!node) return [];
  if (!Array.isArray(node.fusedFrom)) return [];
  // Return the raw fusedFrom entries so we can render full detail rows
  return node.fusedFrom.map((s) => (s || {}));
}

function showDetails(node) {
  // Remove highlight from previously selected card
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.card.fuse-marked').forEach(c => c.classList.remove('fuse-marked'));
  
  // Highlight the selected card
  const selectedCard = document.querySelector(`[data-node-id="${node.id}"]`)?.querySelector('.card');
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
  if (pendingFuseNode && node.id === pendingFuseNode.id) {
    selectedCard?.classList.add('fuse-marked');
  }
  applyFuseVisualState();
  
  details.innerHTML = '';
  const h = document.createElement('div');
  h.className = 'h';
  h.textContent = node.type === 'parcel' ? (node.DISPLAY_NAME || node.PIN) : (node.lotNumber || node.name);
  details.appendChild(h);
  const table = document.createElement('div');
  table.className = 'field-grid';

  if (Array.isArray(node.fusedFrom) && node.fusedFrom.length > 0) {
    const nodeTitle = node.type === 'parcel' ? (node.DISPLAY_NAME || node.PIN || 'Parcel') : (node.lotNumber || node.name || 'Node');
    const identityHeading = document.createElement('div');
    identityHeading.className = 'field-row section-heading';
    identityHeading.innerHTML = `<span class="label">${nodeTitle}</span><span class="value"></span>`;
    table.appendChild(identityHeading);
  }

  if (node.type === 'cadastral') {
    const fields = ['lotNumber', 'lastName', 'firstName', 'barangay', 'section', 'area', 'remarks'];
    fields.forEach(k => {
      const v = node[k] ?? '';
      const row = document.createElement('div');
      row.className = 'field-row';
      row.innerHTML = `<span class="label">${k.replace(/([A-Z])/g, ' $1')}</span><span class="value">${v}</span>`;
      table.appendChild(row);
    });
  } else if (node.type === 'parcel') {
    const fields = ['FID', 'PIN', 'SERVER_PIN', 'NEW_PIN', 'BARANGAY', 'SECTION_NO', 'CADASTRAL_SURVEY_NO', 'TITLE_NO', 'EFF', 'DECLARATION_NO', 'CONVEYANCE', 'DECLARANT', 'PARCEL_NO', 'DISPLAY_NAME', 'OWNER_ADDRESS', 'TOTAL_AREA', 'DATA_UNIT', 'TOTAL_MARKET_VALUE', 'TOTAL_ASSESSED_VALUE', 'CLASSIFICATION'];
    fields.forEach(k => {
      const v = getNodeValue(node, k) ?? '';
      const label = k === 'NEW_PIN' ? 'NEW PIN'
        : k === 'EFF' ? 'EFF.'
        : k === 'DECLARATION_NO' ? 'DECLARATION NO'
        : k === 'CONVEYANCE' ? 'CONVEYANCE'
        : k === 'DECLARANT' ? 'DECLARANT'
        : k.replace(/_/g, ' ');
      const row = document.createElement('div');
      row.className = 'field-row';
      row.innerHTML = `<span class="label">${label}</span><span class="value">${v}</span>`;
      table.appendChild(row);
    });
  } else if (node.type === 'blank') {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span class="label">Type</span><span class="value">New node placeholder</span>`;
    table.appendChild(row);
    const hint = document.createElement('div');
    hint.className = 'field-row';
    hint.innerHTML = `<span class="label">Next</span><span class="value">Use the data editor to enter node details.</span>`;
    table.appendChild(hint);
    sidebarFooter?.classList.remove('hidden');
  } else {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span class="label">Type</span><span class="value">${node.type}</span>`;
    table.appendChild(row);
  }

  const fusedHistory = collectFuseHistory(node);
  if (fusedHistory.length) {
    const divider = document.createElement('div');
    divider.className = 'field-divider';
    table.appendChild(divider);

    fusedHistory.forEach((item, index) => {
      const heading = document.createElement('div');
      heading.className = 'field-row section-heading';
      heading.innerHTML = `<span class="label">SOURCE ${index + 1}</span><span class="value"></span>`;
      table.appendChild(heading);

      // Render fields for each source similarly to normal node details
      const cadastralFields = ['lotNumber', 'lastName', 'firstName', 'barangay', 'section', 'area', 'remarks'];
      const parcelFields = ['FID', 'PIN', 'SERVER_PIN', 'NEW_PIN', 'BARANGAY', 'SECTION_NO', 'CADASTRAL_SURVEY_NO', 'TITLE_NO', 'EFF', 'DECLARATION_NO', 'CONVEYANCE', 'DECLARANT', 'PARCEL_NO', 'DISPLAY_NAME', 'OWNER_ADDRESS', 'TOTAL_AREA', 'DATA_UNIT', 'TOTAL_MARKET_VALUE', 'TOTAL_ASSESSED_VALUE', 'CLASSIFICATION'];

      const isParcelLike = parcelFields.some(f => item[f] != null);
      const fieldsToRender = isParcelLike ? parcelFields : cadastralFields;

      fieldsToRender.forEach(k => {
        const v = getNodeValue(item, k) ?? '';
        const label = k === 'NEW_PIN' ? 'NEW PIN'
          : k === 'EFF' ? 'EFF.'
          : k === 'DECLARATION_NO' ? 'DECLARATION NO'
          : k === 'CONVEYANCE' ? 'CONVEYANCE'
          : k === 'DECLARANT' ? 'DECLARANT'
          : k.replace(/_/g, ' ');
        const row = document.createElement('div');
        row.className = 'field-row';
        row.innerHTML = `<span class="label">${label}</span><span class="value">${v}</span>`;
        table.appendChild(row);
      });
    });
  }

  details.appendChild(table);
  activeSidebarNode = node;
  if (pendingFuseNode && node.id === pendingFuseNode.id) {
    const markedCard = document.querySelector(`[data-node-id="${node.id}"] .card`);
    markedCard?.classList.add('fuse-marked');
  }
  applyFuseVisualState();
  const addPartitionButton = document.getElementById('addPartitionSidebarBtn');
  if (addPartitionButton) {
    addPartitionButton.style.display = node.type === 'blank' ? 'inline-flex' : 'none';
  }
  refreshFuseButtonLabel();
  sidebarFooter?.classList.remove('hidden');
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
}

// ============================================================================
// PROGRAMMATIC FOCUS (postMessage API)
// ============================================================================

function normalizeKeyForMatch(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function findNodeByLot(node, lot) {
  if (!node) return null;
  const target = normalizeKeyForMatch(lot);
  const nodeLot = normalizeKeyForMatch(node.lotNumber || node.CADASTRAL_SURVEY_NO || node.CADASTRAL || '');
  if (nodeLot && target && (nodeLot === target || nodeLot.indexOf(target) !== -1 || target.indexOf(nodeLot) !== -1)) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeByLot(child, lot);
    if (found) return found;
  }
  return null;
}

function findPathToNode(root, nodeId, path) {
  path = path || [];
  if (!root) return null;
  if (root.id === nodeId) return path.concat(root);
  if (!root.children) return null;
  for (const child of root.children) {
    const p = findPathToNode(child, nodeId, path.concat(root));
    if (p) return p;
  }
  return null;
}

function focusOnLot(lot) {
  if (!lot) return;
  const q = String(lot).trim();
  // set search input but don't prematurely open details for fuzzy matches
  searchInput.value = q;
  currentSearchQuery = q.toLowerCase();
  handleSearch();

  // Prefer exact normalized match first
  function findExact(node, lotNorm) {
    if (!node) return null;
    const nodeLot = normalizeKeyForMatch(node.lotNumber || node.CADASTRAL_SURVEY_NO || node.CADASTRAL || '');
    if (nodeLot && nodeLot === lotNorm) return node;
    if (!node.children) return null;
    for (const child of node.children) {
      const f = findExact(child, lotNorm);
      if (f) return f;
    }
    return null;
  }

  const norm = normalizeKeyForMatch(lot);
  const exactNode = findExact(ORG_DATA, norm);
  let node = exactNode || findNodeByLot(ORG_DATA, lot);
  if (node) {
    const path = findPathToNode(ORG_DATA, node.id) || [];
    path.forEach(n => { if (n) n.collapsed = false; });
    render();
    setTimeout(() => {
      try {
        const card = document.querySelector(`[data-node-id="${node.id}"] .card`);
        if (card) {
          const duration = exactNode ? 3000 : 1600;
          card.classList.add('focused-by-parent');
          setTimeout(() => card.classList.remove('focused-by-parent'), duration);
        }
      } catch (e) { /* ignore */ }
    }, 160);
  }
}

// Listen for messages from parent window (parcel page)
window.addEventListener('message', function (ev) {
  try {
    var msg = ev.data || {};
    if (!msg || !msg.type) return;
    if (msg.type === 'parcel-root' || msg.type === 'parcel-data') {
      var lot = msg.lot || msg.cadastralLot || '';
      if (!lot) return;
      focusOnLot(lot);
    }
  } catch (e) { /* ignore malicious/invalid messages */ }
});

/**
 * Close sidebar
 */
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
  sidebarFooter?.classList.add('hidden');
  activeSidebarNode = null;
  pendingFuseNode = null;
  pendingFuseTargetNode = null;
  refreshFuseButtonLabel();
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.card.fuse-marked').forEach(c => c.classList.remove('fuse-marked'));
}

function normalizePrintValue(value) {
  return value == null ? '' : String(value).trim();
}

function getNodeDisplayName(node) {
  if (!node) return '';
  if (node.type === 'parcel') {
    return normalizePrintValue(node.DISPLAY_NAME) || normalizePrintValue(node.DECLARANT) || [normalizePrintValue(node.lastName), normalizePrintValue(node.firstName)].filter(Boolean).join(', ');
  }
  if (node.type === 'cadastral') {
    return [normalizePrintValue(node.lastName), normalizePrintValue(node.firstName)].filter(Boolean).join(', ') || normalizePrintValue(node.name);
  }
  return '';
}

function getNodeLocationValue(node) {
  if (!node) return '';
  return normalizePrintValue(node.LOCATION) || normalizePrintValue(node.OWNER_ADDRESS) || normalizePrintValue(node.barangay) || normalizePrintValue(node.section);
}

function getTracerPrintRows(node) {
  if (!node) return [];
  const path = findPathToNode(ORG_DATA, node.id) || [];
  const rows = path.slice(1).reverse().map(n => ({
    tdNo: normalizePrintValue(n.TD_NO || n.EFF || n.DECLARATION_NO),
    declarant: normalizePrintValue(n.DECLARANT) || getNodeDisplayName(n),
    location: getNodeLocationValue(n),
    lotNo: normalizePrintValue(n.lotNumber || n.CADASTRAL_SURVEY_NO || n.PARCEL_NO),
    area: normalizePrintValue(n.area || n.TOTAL_AREA),
    pin: normalizePrintValue(n.PIN || n.NEW_PIN || n.SERVER_PIN),
    conveyance: normalizePrintValue(n.CONVEYANCE),
    eff: normalizePrintValue(n.EFF)
  }));
  return rows;
}

function getSelectedSidebarNode() {
  if (activeSidebarNode) return activeSidebarNode;
  const selectedCard = document.querySelector('.card.selected');
  if (!selectedCard) return null;
  const nodeId = selectedCard.closest('[data-node-id]')?.getAttribute('data-node-id');
  if (!nodeId) return null;
  return findNodeById(ORG_DATA, nodeId);
}

function openTracerPrint() {
  const node = getSelectedSidebarNode();
  const rows = getTracerPrintRows(node);
  localStorage.setItem('tracerPrintData', JSON.stringify({ rows }));
  window.open('./tracerprint.html', '_blank');
}

// ============================================================================
// SEARCH & FILTERING
// ============================================================================

/**
 * Recursive filter function for search
 */
function filterNodes(node, query) {
  let match = false;
  const lotNumber = node.lotNumber ? String(node.lotNumber).trim() : '';
  const normalizedLotNumber = lotNumber.replace(/^0+/, '') || lotNumber;
  const normalizedQuery = query.replace(/^0+/, '') || query;
  const isNumericQuery = /^\d+$/.test(query);
  const text = [node.lastName, node.firstName, node.DISPLAY_NAME, node.CLASSIFICATION, lotNumber, node.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  
  if (isNumericQuery) {
    if (normalizedLotNumber && normalizedLotNumber === normalizedQuery) match = true;
  } else {
    if (text.includes(query) || text.includes(normalizedQuery)) match = true;
    if (!match && /^\d+$/.test(query) && normalizedLotNumber && normalizedLotNumber === normalizedQuery) {
      match = true;
    }
  }
  
  let children = [];
  if (node.children) {
    children = node.children
      .map(child => filterNodes(child, query))
      .filter(Boolean);
  }
  
  if (match) {
    // If this node matches, keep its full child subtree so newly added children remain visible.
    return Object.assign({}, node, { children: node.children ? node.children.slice() : [] });
  }
  
  if (children.length) {
    return Object.assign({}, node, { children });
  }
  
  return null;
}

/**
 * Handle search input
 */
function handleSearch() {
  const q = searchInput.value.trim().toLowerCase();
  currentSearchQuery = q;
  
  if (!q) {
    render();
    return;
  }
  
  // Use the standard render function which applies both search and viewport filters
  render();
}

// ============================================================================
// PAN & ZOOM INTERACTIVITY
// ============================================================================

/**
 * Apply transform to chart
 * Only applies scale - pan is handled via viewport culling (Facebook-style)
 */
function applyTransform() {
  // Apply both pan and zoom transforms so the chart moves visually.
  chart.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
}

/**
 * Reset view to default
 */
function resetView() {
  transform = { x: 0, y: 0, scale: 1 };
  currentSearchQuery = '';
  searchInput.value = '';
  applyTransform();
  render();
}

/**
 * Fit chart to default view
 */
function fitView() {
  transform = { x: 0, y: 0, scale: 1 };
  applyTransform();
  render();
}

/**
 * Scroll chart up
 */
function scrollUp() {
  transform.y += 100;
  applyTransform();
  render();
}

/**
 * Scroll chart down
 */
function scrollDown() {
  transform.y -= 100;
  applyTransform();
  render();
}

// ============================================================================
// EVENT LISTENERS - WHEEL & MOUSE (Pan & Zoom)
// ============================================================================

wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  
  // Shift+Scroll for vertical navigation (Y axis)
  if (e.shiftKey) {
    const panAmount = e.deltaY * 0.5;
    transform.y -= panAmount;
    applyTransform();
    scheduleRedraw();
  } else {
    // Use scroll for horizontal panning instead of zoom
    // Positive deltaY (scroll down) pans right, negative (scroll up) pans left
    const panAmount = e.deltaY * 0.5; // Adjust multiplier for pan sensitivity
    transform.x -= panAmount;
    applyTransform();
    scheduleRedraw();
  }
});

wrap.addEventListener('mousedown', (e) => {
  pointer.down = true;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  wrap.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  pointer.down = false;
  wrap.style.cursor = 'default';
  // Redraw lines after panning stops
  scheduleRedraw();
});

wrap.addEventListener('mousemove', (e) => {
  if (!pointer.down) return;
  const dx = e.clientX - pointer.x;
  const dy = e.clientY - pointer.y;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  transform.x += dx;
  transform.y += dy;
  applyTransform();
  
  // Re-render with viewport culling on pan
  // Use requestAnimationFrame for smooth panning
  requestAnimationFrame(() => {
    render();
  });
});

// ============================================================================
// EVENT LISTENERS - UI CONTROLS
// ============================================================================

document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
const fuseNodeSidebarBtn = document.getElementById('fuseNodeSidebarBtn');
if (fuseNodeSidebarBtn) {
  fuseNodeSidebarBtn.addEventListener('click', () => {
    const selectedNode = getSelectedSidebarNode();
    if (!selectedNode || selectedNode.id === 'root') return;

    if (!pendingFuseNode) {
      pendingFuseNode = selectedNode;
      refreshFuseButtonLabel();
      showDetails(selectedNode);
      render();
      return;
    }

    if (pendingFuseNode.id === selectedNode.id) {
      pendingFuseNode = null;
      refreshFuseButtonLabel();
      showDetails(selectedNode);
      render();
      return;
    }

    pendingFuseTargetNode = selectedNode;
    showAddPartitionModal({ fuseContext: true });
  });
}
if (tracerPrintBtn) {
  tracerPrintBtn.addEventListener('click', openTracerPrint);
}
document.getElementById('scrollUp').addEventListener('click', () => {
  scrollUp();
  render();
});
document.getElementById('scrollDown').addEventListener('click', () => {
  scrollDown();
  render();
});
document.getElementById('resetView').addEventListener('click', resetView);
document.getElementById('fit').addEventListener('click', fitView);
searchInput.addEventListener('input', handleSearch);

if (addPartitionSidebarBtn) {
  addPartitionSidebarBtn.addEventListener('click', () => {
    if (!activeSidebarNode || activeSidebarNode.type !== 'blank') return;
    showAddPartitionModal();
  });
}

function setArpDefaults() {
  if (!addPartitionForm) return;
  const arpA = addPartitionForm.querySelector('[name="arpA"]');
  const arpB = addPartitionForm.querySelector('[name="arpB"]');
  const arpC = addPartitionForm.querySelector('[name="arpC"]');
  if (arpA) arpA.value = '149';
  if (arpB) arpB.value = '00';
  if (arpC) {
    const selectedBarangay = barangaySelect?.value || '';
    arpC.value = selectedBarangay ? getBarangayCode(selectedBarangay) : '';
  }
}

function showAddPartitionModal(options = {}) {
  setArpDefaults();
  addPartitionModal?.classList.remove('hidden');
  if (options && options.fuseContext) {
    addPartitionModal?.setAttribute('data-fuse-context', 'true');
  } else {
    addPartitionModal?.removeAttribute('data-fuse-context');
  }
}

function hideAddPartitionModal() {
  addPartitionModal?.classList.add('hidden');
  addPartitionModal?.removeAttribute('data-fuse-context');
}

if (addPartitionModal) {
  addPartitionModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', hideAddPartitionModal));
}
if (cancelAddPartitionBtn) {
  cancelAddPartitionBtn.addEventListener('click', hideAddPartitionModal);
}
if (barangaySelect) {
  barangaySelect.addEventListener('change', () => {
    const val = barangaySelect.value || '';
    const code = getBarangayCode(val);
    // debug: log selected barangay and resolved code to console
    try { console.debug('barangay select ->', val, '-> code', code); } catch (e) { /* ignore */ }
    const arpC = addPartitionForm?.querySelector('[name="arpC"]');
    if (arpC) arpC.value = code;
  });
}
if (addPartitionForm) {
  addPartitionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(addPartitionForm);
    const fidValue = formData.get('fid')?.toString().trim() || '';
    const arpValues = [
      formData.get('arpA')?.toString().trim() || '',
      formData.get('arpB')?.toString().trim() || '',
      formData.get('arpC')?.toString().trim() || '',
      formData.get('arpD')?.toString().trim() || '',
      formData.get('arpE')?.toString().trim() || '',
      formData.get('arpF')?.toString().trim() || ''
    ];
    const serverPin = arpValues.join('-');

    const effValue = formData.get('eff')?.toString().trim() || '';
    const areaValue = formData.get('areaSqm')?.toString().trim() || '';
    const improvementValue = formData.get('improvement')?.toString().trim() || '0';
    const ownerName = formData.get('nameOfOwner')?.toString().trim() || '';
    const barangay = formData.get('barangay')?.toString().trim() || '';
    const cadastralLotNo = formData.get('cadastralLotNo')?.toString().trim() || '';
    const assessorsLotNo = formData.get('assessorsLotNo')?.toString().trim() || '';

    const newNode = {
      id: 'par_' + Date.now(),
      type: 'parcel',
      FID: fidValue,
      PIN: assessorsLotNo,
      SERVER_PIN: serverPin,
      NEW_PIN: formData.get('newPin')?.toString().trim() || '',
      BARANGAY: barangay,
      SECTION_NO: formData.get('sectionNo')?.toString().trim() || '',
      CADASTRAL_SURVEY_NO: cadastralLotNo,
      TITLE_NO: formData.get('titleNo')?.toString().trim() || '',
      EFF: effValue,
      DECLARATION_NO: effValue,
      CONVEYANCE: formData.get('conveyance')?.toString().trim() || '',
      DECLARANT: formData.get('declarant')?.toString().trim() || '',
      PARCEL_NO: formData.get('arpE')?.toString().trim() || '',
      DISPLAY_NAME: ownerName,
      OWNER_ADDRESS: formData.get('location')?.toString().trim() || '',
      TOTAL_AREA: areaValue,
      DATA_UNIT: 'sqm',
      TOTAL_MARKET_VALUE: '',
      TOTAL_ASSESSED_VALUE: '',
      CLASSIFICATION: formData.get('classificationCode')?.toString().trim() || '',
      name: ownerName || 'New parcel',
      children: []
    };

    if (pendingFuseNode && pendingFuseTargetNode && pendingFuseNode.id !== pendingFuseTargetNode.id) {
      // Store deep copies of both source nodes so all fields are preserved
      const srcA = JSON.parse(JSON.stringify(findNodeById(ORG_DATA, pendingFuseNode.id) || pendingFuseNode));
      const srcB = JSON.parse(JSON.stringify(findNodeById(ORG_DATA, pendingFuseTargetNode.id) || pendingFuseTargetNode));
      srcA._displayLabel = getNodeDisplayLabel(srcA);
      srcB._displayLabel = getNodeDisplayLabel(srcB);
      newNode.fusedFrom = [srcA, srcB];

      // Attempt to persist the new fused partition as a tracer record (best-effort)
      try {
        const recordPayload = {
          assessorsLotNo,
          cadastralLotNo,
          tdNo: formData.get('tdNo')?.toString().trim() || '',
          newPin: formData.get('newPin')?.toString().trim() || '',
          fid: formData.get('fid')?.toString().trim() || '',
          pin: formData.get('pin')?.toString().trim() || serverPin,
          sectionNo: formData.get('sectionNo')?.toString().trim() || '',
          arpA: formData.get('arpA')?.toString().trim() || '',
          arpB: formData.get('arpB')?.toString().trim() || '',
          arpC: formData.get('arpC')?.toString().trim() || '',
          arpD: formData.get('arpD')?.toString().trim() || '',
          arpE: formData.get('arpE')?.toString().trim() || '',
          arpF: formData.get('arpF')?.toString().trim() || '',
          nameOfOwner: ownerName,
          titleNo: formData.get('titleNo')?.toString().trim() || '',
          areaSqm: areaValue ? Number(areaValue) : undefined,
          classificationCode: formData.get('classificationCode')?.toString().trim() || undefined,
          improvement: improvementValue ? Number(improvementValue) : 0,
          buildingNo: formData.get('buildingNo')?.toString().trim() || '',
          mch: formData.get('mch')?.toString().trim() || '',
          oth: formData.get('oth')?.toString().trim() || '',
          conveyance: formData.get('conveyance')?.toString().trim() || '',
          eff: effValue,
          location: formData.get('location')?.toString().trim() || '',
          declarant: formData.get('declarant')?.toString().trim() || '',
          barangay,
          remarks: '',
        };

        const savedRecord = await createTracerRecord(recordPayload);
        console.debug('createTracerRecord response:', savedRecord);
        newNode.recordId = savedRecord?.id || null;
        newNode.recordSaved = true;
        // trigger global refreshes in the main app if available
        try {
          if (typeof refreshRecords === 'function') refreshRecords();
          if (typeof refreshViewLand === 'function') refreshViewLand();
        } catch (e) { console.warn('Unable to call refresh functions', e); }
      } catch (error) {
        console.warn('Unable to save fused tracer record', error);
        newNode.recordSaved = false;
      }

      const anchorParent = findParentNode(ORG_DATA, pendingFuseNode.id);
      const targetParent = findParentNode(ORG_DATA, pendingFuseTargetNode.id);
      const parentNode = (anchorParent && anchorParent.parent) || (targetParent && targetParent.parent) || ORG_DATA;
      if (parentNode && Array.isArray(parentNode.children)) {
        parentNode.children = parentNode.children.filter((child) => child.id !== pendingFuseNode.id && child.id !== pendingFuseTargetNode.id);
        parentNode.children.push(newNode);
      }

      // notify potential viewers that a new fused node was created
      try {
        window.postMessage({ type: 'tracer:node-fused', node: newNode }, '*');
      } catch (e) { /* ignore */ }
      // also trigger app-level refresh hooks if present
      try {
        if (typeof refreshRecords === 'function') refreshRecords();
        if (typeof refreshViewLand === 'function') refreshViewLand();
      } catch (e) { /* ignore */ }

      pendingFuseNode = null;
      pendingFuseTargetNode = null;
      saveOrgData();
      hideAddPartitionModal();
      addPartitionForm.reset();
      showDetails(newNode);
      render();
      return;
    }

    if (activeSidebarNode) {
      try {
        const recordPayload = {
          assessorsLotNo,
          cadastralLotNo,
          tdNo: formData.get('tdNo')?.toString().trim() || '',
          newPin: formData.get('newPin')?.toString().trim() || '',
          fid: formData.get('fid')?.toString().trim() || '',
          pin: formData.get('pin')?.toString().trim() || serverPin,
          sectionNo: formData.get('sectionNo')?.toString().trim() || '',
          arpA: formData.get('arpA')?.toString().trim() || '',
          arpB: formData.get('arpB')?.toString().trim() || '',
          arpC: formData.get('arpC')?.toString().trim() || '',
          arpD: formData.get('arpD')?.toString().trim() || '',
          arpE: formData.get('arpE')?.toString().trim() || '',
          arpF: formData.get('arpF')?.toString().trim() || '',
          nameOfOwner: ownerName,
          titleNo: formData.get('titleNo')?.toString().trim() || '',
          areaSqm: areaValue ? Number(areaValue) : undefined,
          classificationCode: formData.get('classificationCode')?.toString().trim() || undefined,
          improvement: improvementValue ? Number(improvementValue) : 0,
          buildingNo: formData.get('buildingNo')?.toString().trim() || '',
          mch: formData.get('mch')?.toString().trim() || '',
          oth: formData.get('oth')?.toString().trim() || '',
          conveyance: formData.get('conveyance')?.toString().trim() || '',
          eff: effValue,
          location: formData.get('location')?.toString().trim() || '',
          declarant: formData.get('declarant')?.toString().trim() || '',
          barangay,
          remarks: '',
        };

        const savedRecord = await createTracerRecord(recordPayload);
        newNode.recordId = savedRecord?.id || null;
        newNode.recordSaved = true;
      } catch (error) {
        console.warn('Unable to sync tracer parcel to records', error);
        newNode.recordSaved = false;
      }

      replaceNodeById(ORG_DATA, activeSidebarNode.id, newNode);
      saveOrgData();
      hideAddPartitionModal();
      addPartitionForm.reset();
      showDetails(newNode);
      render();
    }
  });
}

function replaceNodeById(node, nodeId, replacement) {
  if (!node || !node.children) return false;
  const index = node.children.findIndex(child => child.id === nodeId);
  if (index !== -1) {
    node.children[index] = replacement;
    return true;
  }
  return node.children.some(child => replaceNodeById(child, nodeId, replacement));
}

// Delete modal event handlers
const deleteModalForm = document.getElementById('deleteModalForm');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

if (deleteModalForm) {
  deleteModalForm.addEventListener('submit', confirmDeleteNode);
}
if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', hideDeleteModal);
}

// Redraw connector lines on window resize (with debouncing)
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    render();
  }, 150);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Populate dropdowns in the Add Partition modal
tryLoadSystemConfig();

// Initial render
render();
applyTransform();

// If the page was opened with a `lot` or `pin` query param, focus that node
(function() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var lot = params.get('lot') || params.get('search') || params.get('lotNumber');
    var pin = params.get('pin');
    if (lot) {
      // delay slightly so initial layout settles
      setTimeout(function() { focusOnLot(lot); }, 180);
    } else if (pin) {
      setTimeout(function() { focusOnLot(pin); }, 180);
    }
  } catch (e) { /* ignore */ }
})();

/**
 * USAGE NOTES:
 * - Edit ORG_DATA to add more nodes
 * - Add children arrays with type: 'cadastral' (lotNumber, lastName, firstName, barangay, section, area, remarks)
 *   or type: 'parcel' (PIN, FID, SERVER_PIN, DISPLAY_NAME, OWNER_ADDRESS, etc.)
 * - Lines connecting parent-child nodes are drawn via CSS (node-children::before and ::after pseudo-elements)
 * - All interactivity is handled here: pan, zoom, search, node add/delete, sidebar details
 */

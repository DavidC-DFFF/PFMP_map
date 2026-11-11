'use strict';

const elements = Object.fromEntries(
  ['map', 'map-error', 'overview', 'query', 'classroom', 'count', 'places', 'theme']
    .map(id => [id, document.getElementById(id)])
);
const regionalCenter = [49.41, 6.14];
const precisionLabels = {
  rue: 'Repère au niveau de la rue',
  zone: 'Repère au niveau du site',
  commune: 'Repère au centre de la commune',
  absente: 'Localisation à vérifier'
};
const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const sorted = [...lieux].sort((first, second) => collator.compare(first.nom, second.nom));
const markers = new Map();
const listButtons = new Map();
let map;
let layer;
let basemap;
let visible = [];
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const mapStyles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/fiord'
};
const themeKey = 'pfmp-map-theme';

function applyTheme() {
  const choice = elements.theme.value;
  const theme = choice === 'system' ? (systemTheme.matches ? 'dark' : 'light') : choice;
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  basemap?.setStyle(mapStyles[theme]);
}

try {
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === 'light' || savedTheme === 'dark') elements.theme.value = savedTheme;
} catch {
  // Le navigateur peut désactiver le stockage pour les fichiers locaux.
}
elements.theme.disabled = false;
applyTheme();
systemTheme.addEventListener('change', applyTheme);
elements.theme.addEventListener('change', () => {
  applyTheme();
  try {
    localStorage.setItem(themeKey, elements.theme.value);
  } catch {
    // Le thème reste actif pour la page ouverte.
  }
});

function node(tag, value, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function searchText(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function group(place) {
  if (place.a && place.b) return 'both';
  return place.a ? 'a' : 'b';
}

function popup(place) {
  const content = node('div', '');
  const address = [place.rue, [place.code_postal, place.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const classes = [['1CIELA', place.a], ['1CIELB', place.b]]
    .filter(([, count]) => count)
    .map(([name, count]) => `${name} · ${count}`).join(' / ');
  content.append(node('strong', place.nom), node('p', address), node('p', classes));
  if (place.precision !== 'adresse') content.append(node('p', precisionLabels[place.precision], 'popup-note'));
  if (place.commune === 'Drancy') content.append(node('p', 'Adresse du siège enregistrée. Lieu effectif de PFMP à confirmer.', 'popup-note'));
  return content;
}

function zoomTo(places, maxZoom = 12) {
  const points = places.filter(place => place.coordonnees).map(place => place.coordonnees);
  if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom, animate: false });
}

function selectPlace(place) {
  const marker = markers.get(place);
  if (!marker) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), place.precision === 'commune' ? 13 : 15), { animate: false });
  marker.openPopup();
  if (matchMedia('(max-width: 680px)').matches) elements.map.scrollIntoView({ block: 'nearest' });
}

function render() {
  const terms = searchText(elements.query.value).split(' ').filter(Boolean);
  const classroom = elements.classroom.value;
  visible = sorted.filter(place => {
    const haystack = searchText(`${place.nom} ${place.commune} ${place.rue}`);
    return (classroom === 'all' || place[classroom]) && terms.every(term => haystack.includes(term));
  });
  const label = visible.length === 1 ? 'établissement' : 'établissements';
  elements.count.textContent = `${visible.length} ${label} sur ${sorted.length}`;
  elements.places.replaceChildren();
  listButtons.clear();
  if (layer) layer.clearLayers();
  elements.overview.disabled = !map || !visible.some(place => place.coordonnees);
  if (!visible.length) {
    elements.places.append(node('li', 'Aucun établissement pour cette recherche.', 'empty'));
    return;
  }
  for (const place of visible) {
    const li = node('li', '');
    const marker = markers.get(place);
    const item = node(marker ? 'button' : 'div', '', 'place');
    const text = node('span', '');
    const note = place.precision === 'adresse' ? '' : ` · ${precisionLabels[place.precision]}`;
    text.append(node('span', place.nom, 'place-name'), node('span', `${place.commune}${note}`, 'place-meta'));
    item.append(node('span', '', `dot ${group(place)}`), text);
    if (marker) {
      item.type = 'button';
      item.addEventListener('click', () => selectPlace(place));
      listButtons.set(place, item);
      layer.addLayer(marker);
    }
    li.append(item);
    elements.places.append(li);
  }
}

function showMapNotice(message) {
  elements['map-error'].textContent = message;
  elements['map-error'].hidden = !message;
}

function addBasemap() {
  const unavailable = 'Le fond de carte est indisponible. Les repères restent consultables.';
  if (typeof L.maplibreGL !== 'function') {
    showMapNotice(unavailable);
    return;
  }
  try {
    basemap = L.maplibreGL({
      style: mapStyles[document.documentElement.dataset.theme],
      interactive: false
    }).addTo(map).getMaplibreMap();
    basemap.on('error', () => showMapNotice(unavailable));
    basemap.on('idle', () => {
      if (!elements['map-error'].hidden && basemap.isStyleLoaded() && basemap.areTilesLoaded() && basemap.queryRenderedFeatures().length) {
        showMapNotice('');
      }
    });
  } catch {
    showMapNotice(unavailable);
  }
}

if (typeof L === 'undefined') {
  showMapNotice('Leaflet est indisponible. Vérifie la connexion Internet pour afficher la carte.');
} else {
  map = L.map('map', { zoomControl: false, minZoom: 2 }).setView(regionalCenter, 10);
  L.control.zoom({ zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(map);
  addBasemap();
  layer = L.layerGroup().addTo(map);
  for (const place of sorted) {
    if (!place.coordonnees) continue;
    const approximate = place.precision !== 'adresse' ? ' approx' : '';
    const marker = L.marker(place.coordonnees, {
      title: place.nom,
      alt: place.nom,
      icon: L.divIcon({ className: `pin ${group(place)}${approximate}`, iconSize: [16, 16] })
    });
    marker.bindPopup(() => popup(place));
    marker.on('popupopen', () => listButtons.get(place)?.setAttribute('aria-current', 'true'));
    marker.on('popupclose', () => listButtons.get(place)?.removeAttribute('aria-current'));
    markers.set(place, marker);
  }
}

elements.query.addEventListener('input', render);
elements.classroom.addEventListener('change', render);
elements.overview.addEventListener('click', () => zoomTo(visible));
render();
if (map) zoomTo(visible.filter(place => place.commune !== 'Drancy'));

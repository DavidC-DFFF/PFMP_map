'use strict';

const elements = Object.fromEntries(
  ['map', 'map-error', 'query', 'count', 'places', 'theme', 'place-dialog', 'place-details',
    'period', 'period-dates', 'occupancy-legend', 'layout', 'sidebar', 'sidebar-toggle']
    .map(id => [id, document.getElementById(id)])
);
const regionalCenter = [49.41, 6.14];
const precisionLabels = {
  rue: 'Repère au niveau de la rue',
  zone: 'Repère au niveau du site',
  commune: 'Repère au centre de la commune',
  absente: 'Localisation à vérifier'
};
const periods = {
  '2TNE-1': { label: '2TNE · PFMP 1', dates: 'Du 7 au 19 décembre 2026', hasRegister: false },
  '2TNE-2': { label: '2TNE · PFMP 2', dates: 'Du 8 mars au 3 avril 2027', hasRegister: false },
  '1CIEL-1': { label: '1CIEL · PFMP 1', dates: 'Du 9 novembre au 5 décembre 2026', hasRegister: true },
  '1CIEL-2': { label: '1CIEL · PFMP 2', dates: 'Du 24 mai au 19 juin 2027', hasRegister: false },
  'TCIEL-1': { label: 'TCIEL · PFMP 1', dates: 'Du 21 septembre au 10 octobre 2026', hasRegister: true },
  'TCIEL-2': { label: 'TCIEL · PFMP 2', dates: 'Du 18 janvier au 6 février 2027', hasRegister: false }
};
for (const [id, period] of Object.entries(periods)) {
  elements.period.add(new Option(period.label, id));
}
const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const sorted = [...lieux].sort((first, second) => collator.compare(first.nom, second.nom));
const regionalPlaces = sorted.filter(place => {
  const [lat, lon] = place.coordonnees || [];
  return lat >= 48.7 && lat <= 50.3 && lon >= 5.1 && lon <= 7.5;
});
const markers = new Map();
const listButtons = new Map();
let map;
let layer;
let basemap;
const mapStyles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/fiord'
};
const themeKey = 'pfmp-map-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.theme.setAttribute('aria-checked', String(theme === 'dark'));
  basemap?.setStyle(mapStyles[theme]);
}

let initialTheme = 'light';
try {
  if (localStorage.getItem(themeKey) === 'dark') initialTheme = 'dark';
} catch {
  // Le navigateur peut désactiver le stockage pour les fichiers locaux.
}
applyTheme(initialTheme);
elements.theme.disabled = false;
elements.theme.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try {
    localStorage.setItem(themeKey, theme);
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

function cityKey(value) {
  return searchText(value).replace(/\s+cedex(?:\s+\d+)?$/, '');
}

function occupancy(place) {
  const id = elements.period.value;
  if (!id) return '';
  if (place.accueils?.[id] > 0) return 'occupied';
  if (!periods[id].hasRegister || place.accueil_a_verifier?.includes(id)) return '';
  return 'available';
}

function occupancyLabel(place, status) {
  if (status === 'available') return 'N’accueille encore personne à cette période';
  if (status === 'occupied') {
    const count = place.accueils[elements.period.value];
    return `Accueille ${count} élève${count === 1 ? '' : 's'} à cette période`;
  }
  return '';
}

function addHistory(content, place) {
  const years = Object.entries(place.historique || {}).sort(([a], [b]) => b.localeCompare(a));
  content.append(node('h4', 'Historique des accueils'));
  if (!years.length) {
    content.append(node('p', 'Aucun effectif historique renseigné.', 'popup-note'));
    return;
  }
  const history = node('ul', '', 'history');
  for (const [year, count] of years) {
    const item = node('li', '');
    const label = `${count} stagiaire${count === 1 ? '' : 's'}`;
    const button = node('button', year);
    button.type = 'button';
    button.setAttribute('aria-label', `${year}, ${label}`);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') === 'false'));
    });
    item.append(button, node('span', label, 'year-count'));
    history.append(item);
  }
  content.append(history);
}

function placeDetails(place) {
  const content = node('div', '', 'place-details');
  const address = [place.rue, [place.code_postal, place.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  content.append(node('h3', place.nom));
  if (address) content.append(node('p', address));
  if (place.precision !== 'adresse') content.append(node('p', precisionLabels[place.precision], 'popup-note'));
  if (place.note) content.append(node('p', place.note, 'popup-note'));
  const status = occupancy(place);
  if (status) {
    content.append(node('p', occupancyLabel(place, status), `occupancy ${status}`));
  }
  const contacts = node('dl', '', 'contacts');
  contacts.append(
    node('dt', 'Tuteur indiqué dans le suivi'),
    node('dd', place.tuteur || 'À confirmer')
  );
  const phone = node('dd', 'À confirmer');
  if (place.telephone) {
    const link = node('a', place.telephone);
    link.href = `tel:${place.telephone.replace(/[^+\d]/g, '')}`;
    phone.replaceChildren(link);
  }
  contacts.append(node('dt', 'Téléphone de l’établissement'), phone);
  content.append(contacts);
  addHistory(content, place);
  return content;
}

function zoomTo(places, maxZoom = 12) {
  const points = places.filter(place => place.coordonnees).map(place => place.coordonnees);
  if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom, animate: false });
}

function selectPlace(place) {
  const marker = markers.get(place);
  if (!marker) {
    const dialog = elements['place-dialog'];
    elements['place-details'].replaceChildren(placeDetails(place));
    dialog.setAttribute('aria-label', place.nom);
    dialog.showModal();
    return;
  }
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), place.precision === 'commune' ? 13 : 15), { animate: false });
  if (layer.zoomToShowLayer) {
    layer.zoomToShowLayer(marker, () => marker.openPopup());
  } else {
    marker.openPopup();
  }
  if (matchMedia('(max-width: 680px)').matches) elements.map.scrollIntoView({ block: 'nearest' });
}

function placeIcon(place, status) {
  const approximate = place.precision === 'adresse' ? '' : ' approx';
  return L.divIcon({ className: `pin${approximate} ${status}`, iconSize: [16, 16] });
}

function render(focusSearch = false) {
  const query = searchText(elements.query.value);
  const terms = query.split(' ').filter(Boolean);
  const city = cityKey(query);
  const cityPlaces = city ? sorted.filter(place => cityKey(place.commune) === city) : [];
  const visible = cityPlaces.length ? cityPlaces : sorted.filter(place => {
    const haystack = searchText(`${place.nom} ${place.commune} ${place.rue}`);
    return terms.every(term => haystack.includes(term));
  });
  const label = visible.length === 1 ? 'établissement' : 'établissements';
  elements.count.textContent = `${visible.length} ${label} sur ${sorted.length}`;
  elements.places.replaceChildren();
  listButtons.clear();
  if (layer) layer.clearLayers();
  if (!visible.length) {
    elements.places.append(node('li', 'Aucun établissement pour cette recherche.', 'empty'));
    return;
  }
  const displayedMarkers = [];
  for (const place of visible) {
    const li = node('li', '');
    const marker = markers.get(place);
    const item = node('button', '', 'place');
    const text = node('span', '');
    const precision = place.precision === 'adresse' ? '' : precisionLabels[place.precision];
    const status = occupancy(place);
    text.append(node('span', place.nom, 'place-name'));
    text.append(node('span', [place.commune, precision, occupancyLabel(place, status)].filter(Boolean).join(' · '), 'place-meta'));
    const dot = node('span', '', `dot ${status || (place.coordonnees ? '' : 'unlocated')}`);
    dot.setAttribute('aria-hidden', 'true');
    item.append(dot, text);
    item.type = 'button';
    item.addEventListener('click', () => selectPlace(place));
    if (marker) {
      listButtons.set(place, item);
      const icon = placeIcon(place, status);
      if (marker.options.icon.options.className !== icon.options.className) marker.setIcon(icon);
      displayedMarkers.push(marker);
    }
    li.append(item);
    elements.places.append(li);
  }
  if (layer?.addLayers) {
    layer.addLayers(displayedMarkers);
  } else {
    displayedMarkers.forEach(marker => layer.addLayer(marker));
  }
  if (map && focusSearch) {
    if (cityPlaces.length) zoomTo(cityPlaces, 14);
    else if (!query) zoomTo(regionalPlaces);
  }
}

function updatePeriod() {
  const period = periods[elements.period.value];
  elements['period-dates'].hidden = !period;
  elements['occupancy-legend'].hidden = !period?.hasRegister;
  if (period) {
    elements['period-dates'].textContent = period.dates;
  }
  render();
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
  map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 19 }).setView(regionalCenter, 10);
  L.control.zoom({ zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(map);
  addBasemap();
  layer = (L.markerClusterGroup ? L.markerClusterGroup({
    maxClusterRadius: 38,
    showCoverageOnHover: false,
    animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: 'cluster-pin',
        html: `${count}<span class="visually-hidden"> lieux</span>`,
        iconSize: [36, 36]
      });
    }
  }) : L.layerGroup()).addTo(map);
  for (const place of sorted) {
    if (!place.coordonnees) continue;
    const marker = L.marker(place.coordonnees, {
      title: place.nom,
      alt: place.nom,
      icon: placeIcon(place, '')
    });
    marker.bindPopup(() => placeDetails(place));
    marker.on('popupopen', () => listButtons.get(place)?.setAttribute('aria-current', 'true'));
    marker.on('popupclose', () => listButtons.get(place)?.removeAttribute('aria-current'));
    markers.set(place, marker);
  }
}

const sidebarToggle = elements['sidebar-toggle'];
sidebarToggle.hidden = false;
sidebarToggle.addEventListener('click', () => {
  const collapsed = elements.layout.classList.toggle('sidebar-hidden');
  elements.sidebar.hidden = collapsed;
  const label = collapsed ? 'Afficher le panneau de recherche' : 'Masquer le panneau de recherche';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', label);
  sidebarToggle.title = label;
  map?.invalidateSize({ animate: false });
});

elements.query.addEventListener('input', () => render(true));
elements.period.addEventListener('change', updatePeriod);
updatePeriod();
if (map) zoomTo(regionalPlaces);

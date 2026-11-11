"""Génère les données de la carte à partir des adresses du CSV."""

import csv
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
IGN = 'https://data.geopf.fr/geocodage/search'
GEOPORTAIL_LU = 'https://apiv4.geoportail.lu/geocode/search'
PHOTON = 'https://photon.komoot.io/api/'


def fetch(url, *, timeout=10, attempts=3, **params):
    for attempt in range(attempts):
        try:
            with urlopen(f'{url}?{urlencode(params)}', timeout=timeout) as response:
                return json.load(response)
        except (URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(attempt + 1)


def france(row):
    street, city = row['rue'], row['commune']
    postcode = {'57102': '57100', '57974': '57970'}.get(row['code_postal'], row['code_postal'])
    types = {'housenumber': 'adresse', 'street': 'rue', 'locality': 'zone'}
    if street:
        hits = fetch(IGN, q=f'{street} {city}', postcode=postcode, index='address', limit=1)['features']
        if hits:
            hit = hits[0]
            props = hit['properties']
            if props['score'] >= 0.63 and props['type'] in types:
                precision = types[props['type']]
                number = re.match(r'^\d+\w*\b', street)
                if precision == 'adresse' and number and number[0].casefold() != str(props.get('housenumber', '')).casefold():
                    precision = 'rue'
                return hit['geometry']['coordinates'], precision, props['label']
    hits = fetch(IGN, q=city, postcode=postcode, index='address', type='municipality', limit=1)['features']
    if hits and hits[0]['properties']['score'] >= 0.72:
        return hits[0]['geometry']['coordinates'], 'commune', hits[0]['properties']['label']
    locality = re.sub(r'\s+cedex.*$', '', city, flags=re.I)
    if locality:
        hits = fetch(IGN, q=locality, index='address', type='municipality', limit=5)['features']
        for hit in hits:
            props = hit['properties']
            if address_key(locality) == address_key(props['label']) and props['score'] >= 0.72:
                return hit['geometry']['coordinates'], 'commune', props['label']
    return None, 'absente', ''


def luxembourg(row):
    street, city = row['rue'], row['commune']
    postcode = row['code_postal'].removeprefix('L-')
    results = fetch(GEOPORTAIL_LU, queryString=f'{street},{postcode} {city}').get('results', [])
    levels = {5: 'commune', 6: 'rue', 7: 'zone', 8: 'adresse'}
    for hit in results:
        if hit['ratio'] >= 0.75 and hit['accuracy'] in levels:
            return hit['geomlonlat']['coordinates'], levels[hit['accuracy']], hit['address']
    if city:
        results = fetch(GEOPORTAIL_LU, queryString=city).get('results', [])
        for hit in results:
            details = hit.get('AddressDetails') or {}
            locality = details.get('locality') or hit.get('name') or ''
            if hit.get('accuracy') == 5 and address_key(locality) == address_key(city):
                return hit['geomlonlat']['coordinates'], 'commune', city
    return None, 'absente', ''


def address_key(value):
    text = unicodedata.normalize('NFKD', str(value or '').casefold())
    return re.sub(r'[^a-z0-9]', '', text)


def international(row):
    street, city, country = row['rue'], row['commune'], row['pays']
    locality = re.sub(r'\s*(?:\([^)]*\)|\d+)\s*$', '', city)
    if not country or not locality:
        return None, 'absente', ''
    for query, precision in ((f'{street}, {locality}', 'rue'), (locality, 'commune')):
        try:
            hits = fetch(PHOTON, timeout=4, attempts=1, q=query, countrycode=country, limit=5).get('features', [])
        except (URLError, TimeoutError):
            return None, 'absente', ''
        for hit in hits:
            props = hit['properties']
            cities = [props.get(field, '') for field in ('name', 'city', 'district', 'county')]
            if props.get('countrycode', '').upper() != country or not any(
                address_key(locality) == address_key(value) for value in cities
            ):
                continue
            if precision == 'commune' and address_key(locality) != address_key(props.get('name')):
                continue
            if precision == 'rue':
                street_name = props.get('street') or props.get('name') or ''
                street_key = address_key(street_name)
                if not street_key or street_key not in address_key(street):
                    continue
                number = re.match(r'^\d+[a-z]?\b', street, re.I)
                if number and number[0].casefold() == str(props.get('housenumber', '')).casefold():
                    precision = 'adresse'
            return hit['geometry']['coordinates'], precision, query
    return None, 'absente', ''


def geocode(row):
    if row.get('coordonnees_site'):
        lat, lon = map(float, row['coordonnees_site'].split(','))
        coords, precision, match = [lon, lat], 'zone', ''
    elif not row['rue'].strip():
        coords, precision, match = None, 'absente', ''
    else:
        lookup = {'FR': france, 'LU': luxembourg}.get(row['pays'], international)
        coords, precision, match = lookup(row)
    print(f'{row["nom"]} | {precision} | {match}')
    data = {**row, 'historique': json.loads(row.get('historique') or '{}'),
            'accueils': json.loads(row.get('accueils') or '{}'),
            'accueil_a_verifier': (row.get('accueil_a_verifier') or '').split(',') if row.get('accueil_a_verifier') else []}
    return {**data, 'precision': precision,
            'coordonnees': [round(c, 6) for c in reversed(coords)] if coords else None,
            'adresse_geocodee': match}


def main():
    with (ROOT / 'adresses.csv').open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file, delimiter=';'))
    with ThreadPoolExecutor(max_workers=4) as pool:
        data = list(pool.map(geocode, rows))
    output = ROOT / 'lieux.js'
    temporary = output.with_suffix('.tmp')
    temporary.write_text(f'const lieux = {json.dumps(data, ensure_ascii=False, indent=2)};\n', encoding='utf-8')
    temporary.replace(output)


if __name__ == '__main__':
    main()

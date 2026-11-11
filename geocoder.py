"""Génère les données de la carte à partir des adresses du CSV."""

import csv
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
IGN = 'https://data.geopf.fr/geocodage/search'
GEOPORTAIL_LU = 'https://apiv4.geoportail.lu/geocode/search'


def fetch(url, **params):
    for attempt in range(3):
        try:
            with urlopen(f'{url}?{urlencode(params)}', timeout=10) as response:
                return json.load(response)
        except (URLError, TimeoutError):
            if attempt == 2:
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
    return None, 'absente', ''


def luxembourg(row):
    street, city = row['rue'], row['commune']
    postcode = row['code_postal'].removeprefix('L-')
    results = fetch(GEOPORTAIL_LU, queryString=f'{street},{postcode} {city}').get('results', [])
    levels = {5: 'commune', 6: 'rue', 7: 'zone', 8: 'adresse'}
    for hit in results:
        if hit['ratio'] >= 0.75 and hit['accuracy'] in levels:
            return hit['geomlonlat']['coordinates'], levels[hit['accuracy']], hit['address']
    return None, 'absente', ''


def geocode(row):
    if row.get('coordonnees_site'):
        lat, lon = map(float, row['coordonnees_site'].split(','))
        coords, precision, match = [lon, lat], 'zone', ''
    else:
        coords, precision, match = (luxembourg if row['pays'] == 'LU' else france)(row)
    print(f'{row["nom"]} | {precision} | {match}')
    return {**row, 'a': int(row['a']), 'b': int(row['b']), 'precision': precision,
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

"""Refresh catalog metadata from a pinned AmiiboAPI snapshot."""

import argparse
import json
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def download(url):
    for attempt in range(3):
        try:
            with urlopen(url, timeout=25) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('revision', help='AmiiboAPI Git commit SHA')
    args = parser.parse_args()
    origin = f'https://raw.githubusercontent.com/N3evin/AmiiboAPI/{args.revision}'
    raw = json.loads(download(f'{origin}/database/amiibo.json'))
    (ROOT / 'src' / 'data').mkdir(parents=True, exist_ok=True)
    records = []
    for key, amiibo in sorted(raw['amiibos'].items()):
        tag_id = key.removeprefix('0x').lower()
        records.append({
            'id': tag_id,
            'name': amiibo['name'],
            'franchise': raw['game_series'].get(f'0x{tag_id[:3]}', 'Otra'),
            'series': raw['amiibo_series'].get(f'0x{tag_id[12:14]}', 'Otra'),
            'type': raw['types'].get(f'0x{tag_id[6:8]}', ''),
        })
    output = ROOT / 'src' / 'data' / 'catalog.json'
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(records)} registros')


if __name__ == '__main__':
    main()

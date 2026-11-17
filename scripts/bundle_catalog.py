"""Refresh public thumbnails and metadata from a pinned AmiiboAPI snapshot."""

import argparse
import concurrent.futures
import io
import json
import time
from pathlib import Path
from urllib.request import urlopen

from PIL import Image

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


def make_thumbnail(origin, record, max_size=232):
    filename = record['image'].split('/')[-1]
    output = ROOT / 'public' / record['image']
    if output.exists():
        return
    source = download(f'{origin}/images/{filename.replace(".webp", ".png")}')
    with Image.open(io.BytesIO(source)) as original:
        image = original.convert('RGBA')
        image = image.crop(image.getbbox())
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        image.save(output, 'WEBP', quality=79, method=4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('revision', help='AmiiboAPI Git commit SHA')
    args = parser.parse_args()
    origin = f'https://raw.githubusercontent.com/N3evin/AmiiboAPI/{args.revision}'
    raw = json.loads(download(f'{origin}/database/amiibo.json'))
    (ROOT / 'public' / 'figures').mkdir(parents=True, exist_ok=True)
    (ROOT / 'src' / 'data').mkdir(parents=True, exist_ok=True)
    records = []
    for key, amiibo in sorted(raw['amiibos'].items()):
        tag_id = key.removeprefix('0x').lower()
        filename = f'icon_{tag_id[:8]}-{tag_id[8:]}.webp'
        records.append({
            'id': tag_id,
            'name': amiibo['name'],
            'franchise': raw['game_series'].get(f'0x{tag_id[:3]}', 'Otra'),
            'series': raw['amiibo_series'].get(f'0x{tag_id[12:14]}', 'Otra'),
            'type': raw['types'].get(f'0x{tag_id[6:8]}', ''),
            'image': f'figures/{filename}',
        })

    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        tasks = {pool.submit(make_thumbnail, origin, entry): entry for entry in records}
        for task in concurrent.futures.as_completed(tasks):
            try:
                task.result()
            except (OSError, ValueError) as error:
                errors.append(f'{tasks[task]["id"]}: {error}')

    if errors:
        raise SystemExit('\n'.join(errors))
    output = ROOT / 'src' / 'data' / 'catalog.json'
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(records)} registros y miniaturas')


if __name__ == '__main__':
    main()

"""Check pending rejection or validate every approved production image."""
import json
from pathlib import Path

from verify_downtown_art import validate_assets

BASE = Path(__file__).resolve().parents[1]


def main():
    manifest = BASE / 'integration/downtown-art/manifest.json'
    status = json.loads(manifest.read_text(encoding='utf-8')).get('reviewStatus')
    if status == 'approved':
        report = validate_assets(BASE / 'assets/downtown-art', manifest)
        print(f"Approved production images verified: {report['assetCount']}")
    elif status == 'pending':
        try:
            validate_assets(BASE / 'assets/downtown-art', manifest)
        except ValueError as error:
            if 'not reviewed' not in str(error):
                raise
            print('Pending artwork correctly blocks release')
        else:
            raise ValueError('Pending artwork incorrectly passed release validation')
    else:
        raise ValueError('Unknown artwork review status')


if __name__ == '__main__':
    main()

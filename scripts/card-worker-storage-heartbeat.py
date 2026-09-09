"""Private Stage disk heartbeat; install separately on MinIO and VM1001."""
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote

ROOT = Path('/etc/cukies/card-workers')
KEY = 'png/staging/tokens/v2/TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe/_operational/card-worker-storage.json'
BUCKET = 'cukies-cards-staging'


def main(mode):
    assert mode in ('publish', 'receive')
    credentials = json.loads((ROOT / 'writer.json').read_text())
    assert all(isinstance(credentials[k], str) and credentials[k] for k in ('accessKey', 'secretKey'))
    if mode == 'publish':
        disk = os.statvfs('/opt/minio/data')
        metric = {'freeBytes': disk.f_bavail * disk.f_frsize, 'timestamp': time.time()}
        env = os.environ.copy()
        env['MC_HOST_cardspace'] = 'http://' + quote(credentials['accessKey'], safe='') + ':' + quote(credentials['secretKey'], safe='') + '@127.0.0.1:9000'
        result = subprocess.run(['/usr/local/bin/mc', 'pipe', '--quiet', '--attr', 'Content-Type=application/json;Cache-Control=no-store', 'cardspace/' + BUCKET + '/' + KEY], input=json.dumps(metric), text=True, capture_output=True, env=env, timeout=8)
        assert result.returncode == 0, 'upload failed'
        print(json.dumps(metric))
        return
    assert all(all(c not in credentials[k] for c in '\r\n"\\') for k in ('accessKey', 'secretKey'))
    config = 'user = "' + credentials['accessKey'] + ':' + credentials['secretKey'] + '"\n'
    result = subprocess.run(['curl', '--config', '-', '--silent', '--show-error', '--fail', '--max-time', '8', '--aws-sigv4', 'aws:amz:us-east-1:s3', '--header', 'Cache-Control: no-cache', 'http://192.168.1.223:9000/' + BUCKET + '/' + KEY], input=config, text=True, capture_output=True, timeout=10)
    assert result.returncode == 0, 'signed GET failed'
    metric = json.loads(result.stdout)
    assert set(metric) == {'freeBytes', 'timestamp'}
    assert type(metric['freeBytes']) is int and metric['freeBytes'] >= 0
    assert type(metric['timestamp']) in (int, float) and math.isfinite(metric['timestamp'])
    assert 0 <= time.time() - metric['timestamp'] < 25, 'stale metric'
    disk = os.statvfs('/srv')
    state = {'checkedAt': metric['timestamp'], 'freeBytes': metric['freeBytes'],
             'sourceFreeBytes': disk.f_bavail * disk.f_frsize,
             'minioPath': 'LXC2011:/opt/minio/data', 'sourcePath': 'VM1001:/srv'}
    # The directory is mounted read-only in workers; rename keeps readers atomic.
    with tempfile.NamedTemporaryFile(mode='w', prefix='.capacity-', dir=ROOT / 'capacity', delete=False) as handle:
        os.fchmod(handle.fileno(), 0o600)
        json.dump(state, handle)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = handle.name
    os.replace(temporary, ROOT / 'capacity' / 'capacity.json')
    print(json.dumps({'signedGet': 200, **state}))


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception as error:
        print('CARD_STORAGE_HEARTBEAT_FAILED: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)

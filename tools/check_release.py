#!/usr/bin/env python3
"""Verify published hashes and independently read original USGS data."""
from pathlib import Path
import hashlib,json
from verify import load_original,summary
r=Path(__file__).resolve().parents[1]
for line in (r/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split('  ',1);p=(r/name).resolve();p.relative_to(r)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
ref=load_original(r/'data/usgs');print(json.dumps(summary(ref),ensure_ascii=False,indent=2));print('Release hashes verified')

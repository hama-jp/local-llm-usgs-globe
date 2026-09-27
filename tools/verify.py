#!/usr/bin/env python3
"""Independent oracle. Does not import generated code or acquisition implementation."""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

BEGIN, STOP = 1735689600000, 1767225600000
FIELDS = ('id','time_ms','longitude','latitude','depth_km','magnitude','source_url')
CASES = [
    {'name':'all','filters':{'minDepth':None,'maxDepth':None,'minMag':4.5,'maxMag':None}},
    {'name':'shallow','filters':{'minDepth':None,'maxDepth':70,'minMag':4.5,'maxMag':None}},
    {'name':'deep','filters':{'minDepth':300,'maxDepth':None,'minMag':4.5,'maxMag':None}},
    {'name':'large','filters':{'minDepth':None,'maxDepth':None,'minMag':7,'maxMag':None}},
    {'name':'combined','filters':{'minDepth':70,'maxDepth':300,'minMag':5,'maxMag':6}},
    {'name':'empty','filters':{'minDepth':None,'maxDepth':None,'minMag':20,'maxMag':None}},
    {'name':'boundary','filters':{'minDepth':None,'maxDepth':None,'minMag':4.5,'maxMag':4.5}},
]

def number(v):
    return type(v) in (int,float) and math.isfinite(v)

def file_hash(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def safe_file(base, name):
    p=base / name
    if Path(name).is_absolute() or '..' in Path(name).parts or p.is_symlink() or not p.resolve().is_relative_to(base.resolve()):
        raise ValueError('Unsafe evidence path')
    return p

def iso_ms(v):
    return int(dt.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()*1000)

def load_original(base):
    base=Path(base)
    m=json.loads((base/'manifest.json').read_text())
    if m.get('status') != 'complete':
        raise ValueError('Real USGS acquisition is unavailable/incomplete; real-data trial NOT RUN')
    requests={}
    for r in m['requests']:
        if 'path' not in r or r.get('status') not in (200,204):
            raise ValueError('Unsuccessful request in manifest')
        p=safe_file(base,r['path'])
        if file_hash(p)!=r['sha256'] or p.stat().st_size!=r['bytes']:
            raise ValueError('Original hash/size mismatch: '+r['path'])
        if not r.get('retrieved_at'):
            raise ValueError('Missing retrieval timestamp')
        u=urlsplit(r['url'])
        if u.scheme!='https' or u.netloc!='earthquake.usgs.gov':
            raise ValueError('Non-USGS source')
        if r['path'] in requests: raise ValueError('Duplicate manifest path')
        requests[r['path']]=r
    parts=sorted(m['partitions'],key=lambda p:p['start_ms'])
    cursor=BEGIN
    features=[]
    for p in parts:
        if p['start_ms']!=cursor or p['end_ms']<=cursor or p['end_ms']>STOP:
            raise ValueError('Acquisition partitions contain a gap/overlap')
        cursor=p['end_ms']
        for key,method in [('raw','query'),('count_before','count'),('count_after','count')]:
            r=requests[p[key]]; u=urlsplit(r['url']); q=parse_qs(u.query)
            if u.path!='/fdsnws/event/1/'+method or q.get('minmagnitude')!=['4.5'] or q.get('eventtype')!=['earthquake']:
                raise ValueError('Wrong acquisition query')
            if set(q)-{'starttime','endtime','minmagnitude','eventtype','limit','format','orderby'}:
                raise ValueError('Unexpected filtering parameters; must be worldwide')
            if iso_ms(q['starttime'][0])!=p['start_ms'] or iso_ms(q['endtime'][0])!=p['end_ms']-1:
                raise ValueError('Wrong API inclusive endpoints')
            if method=='query' and (q.get('limit')!=['20000'] or q.get('format')!=['geojson']):
                raise ValueError('Query limit/format missing')
        raw=safe_file(base,p['raw']).read_bytes()
        if raw:
            obj=json.loads(raw)
            if obj['type']!='FeatureCollection': raise ValueError('Wrong GeoJSON type')
            fs=obj['features']
            if 'count' in obj.get('metadata',{}) and obj['metadata']['count']!=len(fs): raise ValueError('Metadata count mismatch')
        elif p['count']==0 and requests[p['raw']]['status']==204:
            fs=[]
        else: raise ValueError('Empty query response')
        if len(fs)!=p['count'] or len(fs)>20000: raise ValueError('Truncated query')
        if any(int(safe_file(base,p[k]).read_text())!=len(fs) for k in ('count_before','count_after')):
            raise ValueError('Count changed during acquisition')
        for f in fs:
            ts=f.get('properties',{}).get('time')
            if number(ts) and not p['start_ms']<=ts<p['end_ms']:
                raise ValueError('Event outside fetched partition')
        features.extend(fs)
    if cursor!=STOP: raise ValueError('Acquisition does not cover requested year')
    records={}; excluded=[]; seen=set()
    for f in features:
        eid=f.get('id')
        if not isinstance(eid,str) or not eid or eid in seen:
            raise ValueError('Missing/duplicate event ID')
        seen.add(eid)
        props=f.get('properties') or {}; geo=f.get('geometry') or {}
        t=props.get('time'); mag=props.get('mag')
        reason=None
        if type(t) is not int: reason='missing_or_invalid_time'
        elif not BEGIN<=t<STOP: reason='outside_period'
        elif not number(mag): reason='missing_or_invalid_magnitude'
        elif mag<4.5: reason='below_magnitude'
        elif props.get('type')!='earthquake': reason='not_earthquake'
        if reason:
            excluded.append({'id':eid,'reason':reason}); continue
        c=geo.get('coordinates')
        if geo.get('type')!='Point' or not isinstance(c,list) or len(c)!=3:
            c=[None,None,None]
        records[eid]=dict(zip(FIELDS,[eid,t,c[0],c[1],c[2],mag,props.get('url')]))
    drawable={k:v for k,v in records.items() if valid_location(v)}
    samples=choose_samples(drawable)
    return dict(manifest_sha256=file_hash(base/'manifest.json'), acquired_at=m['finished_at'],
                raw_count=len(features), records=records, drawable=drawable,
                excluded=excluded, unplottable_ids=sorted(set(records)-set(drawable)), samples=samples)

def valid_location(r):
    return (all(number(r[k]) for k in ('longitude','latitude','depth_km'))
            and -180<=r['longitude']<=180 and -90<=r['latitude']<=90)

def choose_samples(records):
    # Three different events, stable ordering and lexicographic ID tie-breaks.
    pool=list(records.values()); out=[]
    for label,key,predicate in [
        ('shallow',lambda r:(r['depth_km'],r['id']),lambda r:r['depth_km']<70),
        ('deep',lambda r:(-r['depth_km'],r['id']),lambda r:r['depth_km']>=300),
        ('large',lambda r:(-r['magnitude'],r['id']),lambda r:True)]:
        candidates=[r for r in pool if predicate(r)]
        if not candidates:
            out.append({'category':label,'status':'unavailable'}); continue
        chosen=min(candidates,key=key)
        out.append(dict(category=label,**chosen))
        pool=[r for r in pool if r['id']!=chosen['id']]
    return out

def selected(records, filters):
    if set(filters)!= {'minDepth','maxDepth','minMag','maxMag'}:
        raise ValueError('Unexpected filter keys')
    if any(v is not None and not number(v) for v in filters.values()):
        raise ValueError('Filter values must be finite numbers or null')
    def keep(r):
        for low,high,field in [('minDepth','maxDepth','depth_km'),('minMag','maxMag','magnitude')]:
            if filters[low] is not None and r[field]<filters[low]: return False
            if filters[high] is not None and r[field]>filters[high]: return False
        return True
    return {k:v for k,v in records.items() if keep(v)}

def position(r,mode,scale):
    lat,lon=map(math.radians,(r['latitude'],r['longitude']))
    radius=1.0 if mode=='surface' else 1.0-r['depth_km']*scale/6371.0
    return [radius*math.cos(lat)*math.cos(lon),radius*math.sin(lat),-radius*math.cos(lat)*math.sin(lon)]

def _verify_snapshot(ref, s, expected_filters=None):
    errors=[]
    def check(ok,message):
        if not ok: errors.append(message)
    check(s.get('schema')==1,'schema must be 1')
    rows=s.get('records',[])
    check(isinstance(rows,list),'records is not an array')
    got={r['id']:r for r in rows}
    check(len(got)==len(rows),'duplicate records')
    check(set(got)==set(ref['records']),'record ID set mismatch')
    for eid in set(got)&set(ref['records']):
        for k in FIELDS:
            check(k in got[eid] and got[eid][k]==ref['records'][eid][k] and not (type(got[eid].get(k)) is bool),f'{eid}: {k} mismatch')
    check(s.get('excluded')==ref['excluded'],'excluded events/reasons mismatch')
    check(sorted(s.get('unplottableIds',[]))==ref['unplottable_ids'],'unplottable IDs mismatch')
    filters=s['filters']
    if expected_filters is not None: check(filters==expected_filters,'UI filter state mismatch')
    expected=selected(ref['drawable'],filters)
    drawn=s['rendered']; ids=[r['id'] for r in drawn]
    check(len(ids)==len(set(ids)),'duplicate rendered IDs')
    check(set(ids)==set(expected),'filtered rendered ID set mismatch')
    check(type(s.get('displayedCount')) is int and s['displayedCount']==len(expected),'displayed count mismatch')
    check(s.get('mode') in ('surface','hypocenter'),'invalid display mode')
    scale=s.get('depthScale')
    check(number(scale) and 1<=scale<=5,'depth scale outside 1..5')
    check(number(s.get('earthRadius')) and s['earthRadius']==1,'earth radius must be normalized to 1')
    if not number(scale): scale=1
    for item in drawn:
        if item['id'] not in expected: continue
        want=position(expected[item['id']],s['mode'],scale)
        xyz=item.get('position')
        check(isinstance(xyz,list) and len(xyz)==3 and all(number(x) for x in xyz) and
              all(abs(a-b)<=1e-5 for a,b in zip(xyz,want)),f'{item["id"]}: rendered XYZ mismatch')
    data=s.get('dataset',{})
    period=ref.get('period', {'start':'2025-01-01T00:00:00Z','endExclusive':'2026-01-01T00:00:00Z'})
    check(all(iso_ms(data.get(k,''))==iso_ms(period[k]) for k in ('start','endExclusive')),'dataset period mismatch')
    check(data.get('manifestSha256')==ref['manifest_sha256'],'dataset provenance hash mismatch')
    check(data.get('acquiredAt')==ref['acquired_at'],'acquisition timestamp mismatch')
    if s.get('selected') is not None:
        chosen=s['selected']; eid=chosen.get('id')
        check(eid in expected,'selected point is not in rendered filter set')
        if eid in expected:
            for k in FIELDS: check(chosen.get(k)==expected[eid][k],f'selected {k} mismatch')
    return dict(status='pass' if not errors else 'fail',expected_count=len(expected),error_count=len(errors),errors=errors[:100])

def verify_snapshot(ref, s, expected_filters=None):
    try:
        return _verify_snapshot(ref, s, expected_filters)
    except Exception as e:
        return {'status':'fail','expected_count':None,'error_count':1,
                'errors':['Malformed app audit snapshot: '+type(e).__name__+': '+str(e)]}



def verify_initial_snapshot(ref, s):
    """The initial view must contain all targets; equivalent bound inputs are valid."""
    result = verify_snapshot(ref, s)
    if result['expected_count'] != len(ref['drawable']):
        result['errors'].append('Initial view must include all drawable target events')
        result['error_count'] += 1
        result['status'] = 'fail'
    return result


def summary(ref):
    return {k:v for k,v in ref.items() if k not in ('records','drawable')} | {
        'target_count':len(ref['records']), 'drawable_count':len(ref['drawable']),
        'app_validation':'not_run', 'note':'Source integrity/count audit only; no claim about an app'}

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data',required=True); ap.add_argument('--snapshot'); ap.add_argument('--out',required=True)
    a=ap.parse_args()
    try:
        ref=load_original(a.data)
        result=summary(ref)
        if a.snapshot:
            result['app_validation']=verify_snapshot(ref,json.loads(Path(a.snapshot).read_text()))
        result['source_status']='pass'
    except Exception as e:
        result=dict(source_status='fail',app_validation='not_run',error=f'{type(e).__name__}: {e}')
    Path(a.out).parent.mkdir(parents=True,exist_ok=True)
    with Path(a.out).open('x') as f: json.dump(result,f,ensure_ascii=False,indent=2)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['source_status']=='pass' and (not a.snapshot or result['app_validation']['status']=='pass') else 2)

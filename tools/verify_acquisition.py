#!/usr/bin/env python3
"""Independent oracle for browser acquisitions; never imports acquisition/app code."""
import argparse,base64,hashlib,json
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from verify import iso_ms,number,valid_location,choose_samples,FIELDS,verify_snapshot

def require(condition,message):
 if not condition: raise ValueError(message)

def load_bundle(path):
 b=json.loads(Path(path).read_text());require(b['schema']=='usgs-acquisition/1','schema')
 c=b['criteria'];start,end=iso_ms(c['startInclusive']),iso_ms(c['endExclusive']);mag=c['minMagnitude']
 require(start<end and c['eventType']=='earthquake' and number(mag),'criteria')
 require(iso_ms(b['startedAt'])<=iso_ms(b['acquiredAt']),'acquisition timestamps')
 bodies=[];intervals=[]
 for r in b['requests']:
  raw=base64.b64decode(r['bodyBase64'],validate=True)
  require(len(raw)==r['bytes'] and hashlib.sha256(raw).hexdigest()==r['sha256'],'original hash/size')
  require(r['status']==200 and iso_ms(b['startedAt'])<=iso_ms(r['acquiredAt'])<=iso_ms(b['acquiredAt']),'request status/time')
  u=urlsplit(r['url']);q=parse_qs(u.query)
  require(u.scheme=='https' and u.netloc=='earthquake.usgs.gov' and not u.fragment and r['kind'] in ('count','query') and u.path=='/fdsnws/event/1/'+r['kind'],'source URL')
  require(set(q)==({'starttime','endtime','minmagnitude','eventtype'}|({'format','limit','orderby'} if r['kind']=='query' else set())) and all(len(v)==1 for v in q.values()),'query parameters')
  require(float(q['minmagnitude'][0])==mag and q['eventtype']==['earthquake'],'query scope')
  a,z=iso_ms(q['starttime'][0]),iso_ms(q['endtime'][0])+1
  require(start<=a<z<=end,'request endpoints');intervals.append((a,z))
  if r['kind']=='query':require(q['limit']==['20000'] and q['format']==['geojson'] and q['orderby']==['time-asc'],'query limit/format')
  bodies.append(raw)
 cursor=start;features=[];used=set()
 for p in b['partitions']:
  a,z=iso_ms(p['startInclusive']),iso_ms(p['endExclusive'])
  require(a==cursor and a<z<=end,'coverage gap/overlap');cursor=z
  for field,kind in [('before','count'),('query','query'),('after','count')]:
   i=p[field];require(type(i)==int and 0<=i<len(bodies) and i not in used and b['requests'][i]['kind']==kind and intervals[i]==(a,z),'partition request reference');used.add(i)
  obj=json.loads(bodies[p['query']]);fs=obj['features']
  require(obj['type']=='FeatureCollection' and isinstance(fs,list) and len(fs)==p['count'] and obj.get('metadata',{}).get('count',len(fs))==len(fs) and len(fs)<=20000,'query count')
  require(int(bodies[p['before']])==len(fs)==int(bodies[p['after']]),'count changed')
  for f in fs:
   t=(f.get('properties') or {}).get('time');require(not number(t) or a<=t<z,'event outside partition')
  features.extend(fs)
 require(cursor==end and len(features)==b['totalCount'],'total coverage/count')
 require(all(r['kind']=='count' or i in used for i,r in enumerate(b['requests'])),'unreferenced query')
 records={};excluded=[];seen=set();places={}
 for f in features:
  eid=f.get('id');require(isinstance(eid,str) and eid and eid not in seen,'missing/duplicate ID');seen.add(eid)
  p=f.get('properties') or {};g=f.get('geometry') or {};t=p.get('time');m=p.get('mag');reason=None
  if type(t)!=int:reason='missing_or_invalid_time'
  elif not start<=t<end:reason='outside_period'
  elif not number(m):reason='missing_or_invalid_magnitude'
  elif m<mag:reason='below_magnitude'
  elif p.get('type')!='earthquake':reason='not_earthquake'
  if reason:excluded.append({'id':eid,'reason':reason});continue
  xyz=g.get('coordinates');xyz=xyz if g.get('type')=='Point' and isinstance(xyz,list) and len(xyz)==3 else [None]*3
  records[eid]=dict(zip(FIELDS,[eid,t,*xyz,m,p.get('url')]));places[eid]=p.get('place')
 drawable={k:v for k,v in records.items() if valid_location(v)}
 digest=hashlib.sha256(json.dumps(b,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
 return dict(manifest_sha256=digest,acquired_at=b['acquiredAt'],period={'start':c['startInclusive'],'endExclusive':c['endExclusive']},raw_count=len(features),records=records,drawable=drawable,excluded=excluded,unplottable_ids=sorted(set(records)-set(drawable)),samples=choose_samples(drawable),places=places)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--bundle',required=True);ap.add_argument('--snapshot');ap.add_argument('--out',required=True);args=ap.parse_args()
 try:
  ref=load_bundle(args.bundle);result={k:v for k,v in ref.items() if k not in ('records','drawable','places')};result.update(source_status='pass',app_validation='not_run')
  if args.snapshot:
   from verify_explorer import verify_explorer
   result['app_validation']=verify_explorer(ref,ref['places'],json.loads(Path(args.snapshot).read_text()))
 except Exception as e:result={'source_status':'fail','app_validation':'not_run','error':str(e)}
 with Path(args.out).open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2)
 print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['source_status']=='pass' and (not args.snapshot or result['app_validation']['status']=='pass') else 2)

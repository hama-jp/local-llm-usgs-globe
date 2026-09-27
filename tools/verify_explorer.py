#!/usr/bin/env python3
"""Independent search/time oracle. Imports no generated application code."""
import json,math,unicodedata
from pathlib import Path
from verify import load_original,verify_snapshot,selected,number,BEGIN,STOP

SORTS={'time-desc':('time_ms',-1),'time-asc':('time_ms',1),'mag-desc':('magnitude',-1),'depth-desc':('depth_km',-1)}
def normalize(value):return unicodedata.normalize('NFKC',value or '').strip().casefold()
def places_from_original(base):
 base=Path(base);manifest=json.loads((base/'manifest.json').read_text());places={}
 # load_original must have validated hashes, coverage and IDs before this is called.
 for part in manifest['partitions']:
  data=(base/part['raw']).read_bytes()
  for f in json.loads(data)['features'] if data else []:places[f['id']]=(f.get('properties') or {}).get('place')
 return places

def validate_bbox(bbox):
 if bbox is None:return
 if not isinstance(bbox,list) or len(bbox)!=4 or not all(number(x) for x in bbox):raise ValueError('Invalid bbox type')
 w,s,e,n=bbox
 if not (-180<=w<=180 and -180<=e<=180 and -90<=s<=n<=90):raise ValueError('Invalid bbox extent')

def context_subset(records,places,text_query='',bbox=None,start_ms=BEGIN,end_ms=STOP):
 validate_bbox(bbox)
 if not all(number(t) for t in (start_ms,end_ms)) or start_ms>end_ms:raise ValueError('Invalid UTC interval')
 query=normalize(text_query);out={}
 for eid,r in records.items():
  if not start_ms<=r['time_ms']<end_ms:continue
  if query and query not in normalize(eid) and query not in normalize(places.get(eid)):continue
  if bbox is not None:
   w,s,e,n=bbox;lon=r['longitude'];lat=r['latitude']
   if not s<=lat<=n:continue
   if not ((w<=lon<=e) if w<=e else (lon>=w or lon<=e)):continue
  out[eid]=r
 return out

def ordered_ids(records,sort):
 if sort not in SORTS:raise ValueError('Undeclared sort: '+str(sort))
 field,direction=SORTS[sort]
 return sorted(records,key=lambda eid:(direction*records[eid][field],eid))

def verify_explorer(ref,places,s,expected=None,dom=None):
 errors=[]
 try:
  e=s['explorer'];query=e['textQuery'];bbox=e['bbox'];sort=e['sort'];page=e['page'];size=e['pageSize']
  if not isinstance(query,str):raise ValueError('textQuery must be string')
  start=e.get('startMs',BEGIN);end=e.get('endMs',STOP)
  for key,value in (expected or {}).items():
   if e.get(key)!=value:errors.append('Applied UI state differs: '+key)
  eligible=context_subset(ref['drawable'],places,query,bbox,start,end)
  result=verify_snapshot(ref|{'drawable':eligible},s);errors.extend(result['errors'])
  filtered=selected(eligible,s['filters']);ids=ordered_ids(filtered,sort)
  if type(page)!=int or type(size)!=int or not 1<=size<=200:raise ValueError('Invalid pagination')
  if not 1<=page<=max(1,math.ceil(len(ids)/size)):errors.append('Page outside range')
  pageids=ids[(page-1)*size:page*size]
  if e['matchedIds']!=ids:errors.append('Sorted full result IDs differ from original')
  if e['pageIds']!=pageids:errors.append('Page IDs differ from expected slice')
  if dom:
   if dom['ids']!=pageids:errors.append('DOM list order differs from expected slice')
   if dom['total']!=len(ids):errors.append('DOM result total mismatch')
   selected_record=s.get('selected')
   if selected_record and dom.get('place')!=places.get(selected_record['id']):errors.append('DOM selected place differs from original')
  return {'status':'fail' if errors else 'pass','expected_count':len(ids),'expected_page_ids':pageids,'errors':errors}
 except (KeyError,TypeError,ValueError,OverflowError) as exc:
  return {'status':'fail','errors':errors+[type(exc).__name__+': '+str(exc)]}

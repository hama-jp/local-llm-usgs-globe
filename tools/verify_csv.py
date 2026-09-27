"""Independent CSV export oracle; reads original records, never application code."""
import csv,io
from verify import selected,iso_ms,BEGIN,STOP
from verify_explorer import context_subset,ordered_ids
COLUMNS=['id','time_utc','longitude','latitude','depth_km','magnitude','place','source_url']
def verify_csv(ref,places,state,text):
 errors=[]
 try:
  ex=state['explorer'];rows=selected(context_subset(ref['drawable'],places,ex['textQuery'],ex['bbox'],ex.get('startMs',BEGIN),ex.get('endMs',STOP)),state['filters']);ids=ordered_ids(rows,ex['sort'])
  reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff'),newline=''));got=list(reader)
  if reader.fieldnames!=COLUMNS:errors.append('CSV columns differ')
  if [r['id'] for r in got]!=ids:errors.append('CSV full sorted ID list mismatch')
  for row in got:
   eid=row['id']
   if eid not in rows:continue
   r=rows[eid]
   if iso_ms(row['time_utc'])!=r['time_ms']:errors.append(eid+': UTC timestamp mismatch')
   for key in ['longitude','latitude','depth_km','magnitude']:
    if float(row[key])!=r[key]:errors.append(eid+': '+key+' mismatch')
   if row['place']!=(places.get(eid) or ''):errors.append(eid+': original place mismatch')
   if row['source_url']!=r['source_url']:errors.append(eid+': source mismatch')
  return {'status':'fail' if errors else 'pass','expected_count':len(ids),'parsed_count':len(got),'errors':errors[:50]}
 except (ValueError,KeyError,TypeError,csv.Error) as exc:return {'status':'fail','errors':errors+[type(exc).__name__+': '+str(exc)]}

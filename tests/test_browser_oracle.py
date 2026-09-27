"""Synthetic fixtures only. No test data is copied to viewer assets."""
import sys,unittest,tempfile,json,base64,hashlib,copy
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from verify_acquisition import load_bundle
class BrowserOracle(unittest.TestCase):
 def setUp(self):
  feature={'type':'Feature','id':'synthetic-unit-only','properties':{'time':1709164800123,'mag':4.5,'type':'earthquake','url':'https://earthquake.usgs.gov/earthquakes/eventpage/synthetic-unit-only'},'geometry':{'type':'Point','coordinates':[135,35,10]}}
  raw=json.dumps({'type':'FeatureCollection','features':[feature]}).encode();self.bundle={'schema':'usgs-acquisition/1','criteria':{'startInclusive':'2024-02-29T00:00:00.000Z','endExclusive':'2024-03-01T00:00:00.000Z','minMagnitude':4.5,'eventType':'earthquake'},'startedAt':'2026-01-01T00:00:00Z','acquiredAt':'2026-01-01T00:00:02Z','requests':[],'partitions':[{'startInclusive':'2024-02-29T00:00:00.000Z','endExclusive':'2024-03-01T00:00:00.000Z','count':1,'before':0,'query':1,'after':2}],'totalCount':1}
  for kind,body in [('count',b'1'),('query',raw),('count',b'1')]:
   params={'starttime':'2024-02-29T00:00:00.000Z','endtime':'2024-02-29T23:59:59.999Z','minmagnitude':'4.5','eventtype':'earthquake'}
   if kind=='query':params.update(format='geojson',limit='20000',orderby='time-asc')
   self.bundle['requests'].append({'kind':kind,'url':'https://earthquake.usgs.gov/fdsnws/event/1/'+kind+'?'+urlencode(params),'status':200,'acquiredAt':'2026-01-01T00:00:01Z','bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'bodyBase64':base64.b64encode(body).decode()})
 def load(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'fixture.json';p.write_text(json.dumps(self.bundle));return load_bundle(p)
 def test_valid_leap_millisecond(self):self.assertEqual(self.load()['records']['synthetic-unit-only']['time_ms'],1709164800123)
 def test_body_tamper(self):
  self.bundle['requests'][1]['bodyBase64']='e30='
  with self.assertRaises(ValueError):self.load()
 def test_query_extra(self):
  self.bundle['requests'][1]['url']+='&minlatitude=0'
  with self.assertRaises(ValueError):self.load()
 def test_end_inclusive_error(self):
  self.bundle['partitions'][0]['endExclusive']='2024-02-29T23:59:59.999Z'
  with self.assertRaises(ValueError):self.load()
 def test_missing_partition(self):
  self.bundle['partitions']=[]
  with self.assertRaises(ValueError):self.load()
 def test_misused_count_reference(self):
  self.bundle['partitions'][0]['after']=0
  with self.assertRaises(ValueError):self.load()
 def test_wrong_total(self):
  self.bundle['totalCount']=2
  with self.assertRaises(ValueError):self.load()
if __name__=='__main__':unittest.main()

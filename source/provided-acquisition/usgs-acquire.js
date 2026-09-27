/* Trusted acquisition-only utility, supplied by Codex. No display data transformation. */
(() => {
  'use strict';
  const BASE='https://earthquake.usgs.gov/fdsnws/event/1/';
  const LIMITS=Object.freeze({queryEvents:20000,totalEvents:100000,days:3660,bytes:100*1024*1024,requests:256,timeoutMs:60000});
  const iso=ms=>new Date(ms).toISOString();
  function criteria(input) {
    const {startMs,endMs,minMagnitude=4.5}=input;
    if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs>=endMs||!Number.isFinite(new Date(startMs).getTime())||!Number.isFinite(new Date(endMs).getTime())) throw Error('開始・終了日時を正しく指定してください。');
    if((endMs-startMs)/86400000>LIMITS.days) throw Error('1回の取得期間は3660日以内です。期間を分けてください。');
    if(!Number.isFinite(minMagnitude)||minMagnitude < -2 || minMagnitude > 10) throw Error('最小マグニチュードは-2〜10です。');
    return {startInclusive:iso(startMs),endExclusive:iso(endMs),minMagnitude,eventType:'earthquake'};
  }
  const aborted=signal=>{if(signal?.aborted) throw new DOMException('取得をキャンセルしました。','AbortError');};
  const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
  async function acquire(input) {
    const spec=criteria(input), {signal,onProgress=()=>{}}=input;
    if(!globalThis.crypto?.subtle) throw Error('原本のSHA-256計算が利用できません。HTTPSまたはローカルファイルで開いてください。');
    const bundle={schema:'usgs-acquisition/1',criteria:spec,startedAt:iso(Date.now()),acquiredAt:null,requests:[],partitions:[]};
    let totalBytes=0,requestCount=0,acceptedCount=0;
    async function request(kind,start,end) {
      aborted(signal);
      if(++requestCount>LIMITS.requests)throw Error('取得リクエスト上限です。期間を狭めてください。');
      const url=new URL(kind,BASE);
      Object.entries({starttime:iso(start),endtime:iso(end-1),minmagnitude:spec.minMagnitude,eventtype:'earthquake',...(kind==='query'?{format:'geojson',orderby:'time-asc',limit:LIMITS.queryEvents}:{})}).forEach(([k,v])=>url.searchParams.set(k,v));
      onProgress({phase:kind,requests:requestCount,bytes:totalBytes,events:acceptedCount,startInclusive:iso(start),endExclusive:iso(end)});
      const controller=new AbortController(), forward=()=>controller.abort();
      signal?.addEventListener('abort',forward,{once:true});
      const timer=setTimeout(()=>controller.abort(),LIMITS.timeoutMs);
      let bytes;
      try {
        aborted(signal);
        const response=await fetch(url.href,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error(`USGS取得失敗 (HTTP ${response.status})。現在のデータは保持されます。`);
        const reader=response.body.getReader(),chunks=[];let size=0;
        try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;totalBytes+=value.length;if(totalBytes>LIMITS.bytes)throw Error('原本の取得上限100MiBです。期間を狭めてください。');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
        bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      } catch(error) {
        aborted(signal);
        if(controller.signal.aborted)throw Error('USGS取得が60秒でタイムアウトしました。再試行してください。');
        throw error;
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',forward);}
      aborted(signal);
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      const index=bundle.requests.length;
      bundle.requests.push({kind,url:url.href,acquiredAt:iso(Date.now()),status:200,bytes:bytes.length,sha256,bodyBase64:b64(bytes)});
      return {index,text};
    }
    function count(response){if(!/^\d+\s*$/.test(response.text))throw Error('USGS件数応答が不正です。');const n=Number(response.text);if(!Number.isSafeInteger(n))throw Error('USGS件数応答が不正です。');return n;}
    async function partition(start,end) {
      const before=await request('count',start,end),n=count(before);
      if(n+acceptedCount>LIMITS.totalEvents)throw Error('10万件を超えます。期間を狭めるか最小マグニチュードを上げてください。');
      if(n>LIMITS.queryEvents){if(end-start<=1)throw Error('1ミリ秒の区間で件数上限を超えました。');const mid=start+Math.floor((end-start)/2);await partition(start,mid);await partition(mid,end);return;}
      const query=await request('query',start,end),after=await request('count',start,end);
      const raw=JSON.parse(query.text);
      if(raw.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length!==n||count(after)!==n||(raw.metadata?.count!==undefined && raw.metadata.count!==n))throw Error('取得中にUSGSの件数が変化したか、応答が不完全でした。現在のデータを保持します。再試行してください。');
      bundle.partitions.push({startInclusive:iso(start),endExclusive:iso(end),count:n,before:before.index,query:query.index,after:after.index});acceptedCount+=n;
      onProgress({phase:'partition-complete',requests:requestCount,bytes:totalBytes,events:acceptedCount});
    }
    await partition(input.startMs,input.endMs);aborted(signal);
    bundle.acquiredAt=iso(Date.now());bundle.totalCount=acceptedCount;
    return bundle;
  }
  globalThis.USGSAcquire=Object.freeze({acquire,criteria,LIMITS});
})();

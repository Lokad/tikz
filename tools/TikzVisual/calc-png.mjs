// Bounded PNG sample decoder for the pinned development renderers; no browser.
import assert from 'node:assert/strict';
import {inflateSync,deflateSync} from 'node:zlib';
const signature=Buffer.from('89504e470d0a1a0a','hex');
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4,'ascii');data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function paeth(a,b,c){const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;}

export function decodeCalcPng(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=45&&bytes.length<=100000000,'Invalid PNG length');
  assert.ok(bytes.subarray(0,8).equals(signature),'Invalid PNG signature');
  let offset=8,header,ended=false,idatEnded=false;const compressed=[];
  while(offset<bytes.length){
    assert.ok(offset+12<=bytes.length,'Truncated PNG chunk');const length=bytes.readUInt32BE(offset),end=offset+length+12;
    assert.ok(end<=bytes.length,'Truncated PNG payload');const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,end-4);
    assert.match(type,/^[A-Za-z]{4}$/);assert.equal(crc(bytes.subarray(offset+4,end-4)),bytes.readUInt32BE(end-4),'PNG CRC differs');
    if(type==='IHDR'){
      assert.equal(offset,8);assert.equal(length,13);assert.equal(header,undefined);header=Buffer.from(data);
      assert.equal(data[8],8,'Only 8-bit PNG samples are supported');assert.ok([2,6].includes(data[9]),'Expected RGB or RGBA PNG');
      assert.deepEqual([...data.subarray(10)],[0,0,0],'PNG compression/filter/interlace differs');
    }else if(type==='IDAT'){assert.ok(header&&!idatEnded&&!ended,'Invalid PNG data order');compressed.push(data);}
    else if(type==='IEND'){assert.equal(length,0);assert.ok(header&&compressed.length>0&&!ended);ended=true;assert.equal(end,bytes.length,'Trailing PNG bytes');}
    else{
      assert.ok(header&&!ended);assert.ok(['pHYs','sRGB','gAMA'].includes(type),'Unsupported PNG chunk '+type);
      if(compressed.length)idatEnded=true;
      if(type==='pHYs'){assert.equal(length,9);assert.ok(data[8]<=1);}
      if(type==='sRGB'){assert.equal(length,1);assert.ok(data[0]<=3);}
      if(type==='gAMA'){assert.equal(length,4);assert.equal(data.readUInt32BE(),45455,'Unexpected gamma');}
    }
    offset=end;
  }
  assert.ok(ended&&header&&compressed.length);const width=header.readUInt32BE(),height=header.readUInt32BE(4),channels=header[9]===6?4:3;
  assert.ok(width>0&&height>0&&width*height<=20000000,'PNG pixel budget exceeded');
  const stride=width*channels,expected=(stride+1)*height,raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});
  assert.equal(raw.length,expected,'PNG decompressed size differs');
  const samples=Buffer.allocUnsafe(stride*height),rgba=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];assert.ok(filter<=4,'Unknown PNG row filter');
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=channels?samples[i-channels]:0,b=y?samples[i-stride]:0,c=y&&x>=channels?samples[i-stride-channels]:0;
      const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
      samples[i]=(raw[y*(stride+1)+x+1]+prediction)&255;
    }
    for(let x=0;x<width;x++){const from=y*stride+x*channels,to=(y*width+x)*4;rgba[to]=samples[from];rgba[to+1]=samples[from+1];rgba[to+2]=samples[from+2];rgba[to+3]=channels===4?samples[from+3]:255;}
  }
  return{width,height,rgba};
}

// Small controlled fixtures for decoder and evidence-corruption tests.
export function encodeCalcPng(width,height,rgba,{channels=4,filters=[0]}={}){
  assert.ok(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width*height<=20000000);
  assert.equal(rgba.length,width*height*4);assert.ok([3,4].includes(channels));assert.ok(filters.length>0&&filters.every(n=>Number.isInteger(n)&&n>=0&&n<=4));
  const stride=width*channels,samples=Buffer.alloc(stride*height),raw=Buffer.alloc((stride+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<channels;c++)samples[y*stride+x*channels+c]=rgba[(y*width+x)*4+c];
  for(let y=0;y<height;y++){const filter=filters[y%filters.length];raw[y*(stride+1)]=filter;
    for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?samples[i-channels]:0,b=y?samples[i-stride]:0,c=y&&x>=channels?samples[i-stride-channels]:0;
      const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);raw[y*(stride+1)+x+1]=(samples[i]-prediction)&255;}}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

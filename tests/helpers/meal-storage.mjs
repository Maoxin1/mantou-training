// Shared synthetic storage for API and browser tests; no database credentials.
export function memoryStorage(){
  const data=new Map(),dead=new Set();
  return {
    data,dead,
    keys:async prefix=>[...data.keys()].map(k=>k+'.jpg').concat([...dead].map(k=>k+'.deleted')).filter(k=>k.startsWith(prefix)),
    isDeleted:async k=>dead.has(k),
    markDeleted:async k=>{dead.add(k);},
    removeImage:async k=>{data.delete(k);},
    putImage:async(k,b)=>{data.set(k,b);},
    list:async prefix=>[...new Set([...data.keys(),...dead])].filter(k=>k.startsWith(prefix)).map(k=>{
      const [date,meal,id]=k.split('/').slice(-3);
      return {id,date,meal,...(dead.has(k)?{deleted:true}:{deleted:false,data:data.get(k).toString('base64')})};
    })
  };
}

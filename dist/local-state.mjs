import {fresh,validateBackup} from './engine.mjs';

// Keep unreadable bytes in place until an explicit recovery action preserves them.
export class LocalState {
  constructor(storage,key){
    this.storage=storage;this.key=key;this.state=fresh();this.raw=null;this.error=null;
    try{this.raw=storage.getItem(key);if(this.raw!==null)this.state=validateBackup(JSON.parse(this.raw));}
    catch(error){this.error=error;}
  }
  save(state){
    if(this.error)throw Error('原始记录尚未恢复，请先下载原始数据或在设置中恢复备份');
    if(this.storage.getItem(this.key)!==this.raw)throw Error('另一窗口已修改本机记录，请刷新后重试');
    const raw=JSON.stringify(validateBackup(state));this.storage.setItem(this.key,raw);this.raw=raw;this.state=state;
  }
  replace(state){
    const clean=validateBackup(state),raw=this.storage.getItem(this.key);
    // Failure to preserve the old value must abort replacement, including quota errors.
    if(raw!==null)this.storage.setItem(this.key+':recovery:'+crypto.randomUUID(),raw);
    const serialized=JSON.stringify(clean);this.storage.setItem(this.key,serialized);
    this.raw=serialized;this.state=clean;this.error=null;
  }
}

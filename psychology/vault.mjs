// Local encrypted journal. This module never performs network requests.
export const VAULT_KEY='aspace-psychology-vault-v1';
const ITERATIONS=250000,MAX_BYTES=4_000_000;
const encode=new TextEncoder(),decode=new TextDecoder();
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function validateEnvelope(value){
 if(!value||value.v!==1||value.iterations!==ITERATIONS||typeof value.salt!=='string'||typeof value.iv!=='string'||typeof value.data!=='string'||value.data.length>MAX_BYTES)throw Error('Это не поддерживаемая резервная копия дневника');
 try{if(unb64(value.salt).length!==16||unb64(value.iv).length!==12||unb64(value.data).length<16)throw Error()}catch{throw Error('Повреждённая резервная копия')}
 return {v:1,iterations:ITERATIONS,salt:value.salt,iv:value.iv,data:value.data};
}
function checkData(data){
 if(!data||data.v!==1||!Array.isArray(data.entries)||data.entries.length>2000||!data.drafts||typeof data.drafts!=='object'||Array.isArray(data.drafts))throw Error('Неподдерживаемые данные дневника');
 const entries=data.entries,records=[...entries,...Object.values(data.drafts)];
 if(records.length>2500)throw Error('Слишком много записей');
 for(const entry of records){
  if(!entry||typeof entry!=='object'||typeof entry.type!=='string'||!entry.fields||typeof entry.fields!=='object'||Array.isArray(entry.fields))throw Error('Повреждённая запись');
  if(Object.keys(entry.fields).length>60||Object.values(entry.fields).some(x=>typeof x!=='string'||x.length>30000))throw Error('Некорректное поле записи');
 }
 if(encode.encode(JSON.stringify(data)).length>2_700_000)throw Error('Дневник слишком большой. Сохрани резервную копию и освободи место.');
 return data;
}
async function derive(pass,salt){
 if(typeof pass!=='string'||pass.length<10)throw Error('Используй пароль или фразу не короче 10 символов');
 const material=await crypto.subtle.importKey('raw',encode.encode(pass),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function decrypt(record,key){
 try{return checkData(JSON.parse(decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv)},key,unb64(record.data)))))}
 catch{throw Error('Не удалось открыть: проверь пароль и целостность копии')}
}
export class JournalVault{
 constructor(storage=globalThis.localStorage){this.storage=storage;this.key=null;this.data=null;this.salt=null;this.queue=Promise.resolve()}
 get open(){return !!this.key}
 get exists(){return this.storage.getItem(VAULT_KEY)!==null}
 async create(pass){
  if(this.exists)throw Error('Дневник уже существует. Открой его своим паролем.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(pass,salt);
  const data={v:1,entries:[],drafts:{}};await this.persist(data,key,salt);this.key=key;this.salt=salt;this.data=data;
 }
 async unlock(pass){
  const record=validateEnvelope(JSON.parse(this.storage.getItem(VAULT_KEY)||'null')),salt=unb64(record.salt),key=await derive(pass,salt);
  const data=await decrypt(record,key);this.key=key;this.salt=salt;this.data=data;
 }
 async seal(data,key=this.key,salt=this.salt){
  if(!key)throw Error('Сначала открой дневник');checkData(data);
  const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encode.encode(JSON.stringify(data)));
  return {v:1,iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(encrypted))};
 }
 async persist(data,key=this.key,salt=this.salt){
  const envelope=await this.seal(data,key,salt);
  // setItem is atomic: a quota failure retains the previous encrypted record.
  try{this.storage.setItem(VAULT_KEY,JSON.stringify(envelope))}catch{throw Error('Не удалось сохранить на устройстве. Скачай резервную копию открытого дневника; проверь доступное место.');}
 }
 mutate(fn){
  const task=this.queue.then(async()=>{if(!this.open)throw Error('Дневник закрыт');const next=structuredClone(this.data);fn(next);checkData(next);await this.persist(next);this.data=next});
  this.queue=task.catch(()=>{});return task;
 }
 async lock(){await this.queue;this.key=null;this.salt=null;this.data=null}
 async backup(patch){await this.queue;if(this.open){const data=structuredClone(this.data);if(patch)patch(data);return this.seal(data)}const raw=this.storage.getItem(VAULT_KEY);if(!raw)throw Error('Нет сохранённого дневника');return validateEnvelope(JSON.parse(raw))}
 async restore(raw,pass){
  await this.queue;const record=validateEnvelope(typeof raw==='string'?JSON.parse(raw):raw),salt=unb64(record.salt),key=await derive(pass,salt),data=await decrypt(record,key);
  // Verify before replacing a current local vault. The UI asks before replacement.
  this.storage.setItem(VAULT_KEY,JSON.stringify(record));this.key=key;this.salt=salt;this.data=data;
 }
}

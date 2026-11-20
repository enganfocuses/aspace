/* Appearance only: no content or journal data is read. */
(()=>{
  const valid=value=>['beige','white','dark'].includes(value);
  const apply=value=>{document.documentElement.dataset.theme=valid(value)?value:'beige'};
  const queryTheme=new URLSearchParams(location.search).get('theme');
  let saved;try{saved=JSON.parse(localStorage.getItem('aspace-theme'))}catch{}
  apply(queryTheme||saved);
  addEventListener('storage',event=>{if(!queryTheme&&event.key==='aspace-theme'){try{apply(JSON.parse(event.newValue))}catch{apply('beige')}}});
  addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='aspace-theme')apply(event.data.theme)});
})();

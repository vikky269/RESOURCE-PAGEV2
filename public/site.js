(() => {
  const root=document.documentElement;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=false;
  try {paused=localStorage.getItem('smartmathz-motion')==='paused';} catch {}
  function updateMotion(){
    const stopped=paused||reduce.matches;
    root.classList.toggle('motion-on',!stopped);
    root.classList.toggle('motion-paused',stopped);
    document.querySelectorAll('.motion-toggle').forEach(button=>{
      button.setAttribute('aria-pressed',String(stopped));
      button.disabled=reduce.matches;
      button.querySelector('.motion-label').textContent=reduce.matches?'Reduced motion':stopped?'Play animations':'Pause animations';
      button.querySelector('.motion-symbol').textContent=stopped?'▷':'Ⅱ';
    });
  }
  document.querySelectorAll('.motion-toggle').forEach(button=>button.addEventListener('click',()=>{
    paused=!paused;try{localStorage.setItem('smartmathz-motion',paused?'paused':'on');}catch{}updateMotion();
  }));
  reduce.addEventListener('change',updateMotion);updateMotion();
  if(!reduce.matches&&!paused&&'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.dataset.revealState='visible';observer.unobserve(entry.target);}
    }),{threshold:0.08});
    document.querySelectorAll('[data-reveal]').forEach(section=>{section.dataset.revealState='waiting';observer.observe(section);});
  }
  const toggle=document.querySelector('#mobile-toggle'), menu=document.querySelector('#mobile-nav');
  function closeMenu(){if(!toggle||!menu)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}
  toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';menu.hidden=open;toggle.setAttribute('aria-expanded',String(!open));toggle.setAttribute('aria-label',open?'Open navigation':'Close navigation');});
  menu?.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle?.getAttribute('aria-expanded')==='true'){closeMenu();toggle.focus();}});
  const year=document.querySelector('#year');if(year)year.textContent=new Date().getFullYear();
})();

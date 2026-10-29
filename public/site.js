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
    }),{threshold:0.08,rootMargin:'0px 0px -6% 0px'});
    document.querySelectorAll('[data-reveal]').forEach(section=>{section.dataset.revealState='waiting';observer.observe(section);});
  }
  // Kick hero entrance after first paint so CSS delays feel intentional.
  requestAnimationFrame(()=>document.documentElement.classList.add('hero-ready'));
  const toggle=document.querySelector('#mobile-toggle'), menu=document.querySelector('#mobile-nav');
  function closeMenu(){if(!toggle||!menu)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}
  toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';menu.hidden=open;toggle.setAttribute('aria-expanded',String(!open));toggle.setAttribute('aria-label',open?'Open navigation':'Close navigation');});
  menu?.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle?.getAttribute('aria-expanded')==='true'){closeMenu();toggle.focus();}});
  const year=document.querySelector('#year');if(year)year.textContent=new Date().getFullYear();

  // Soft circle that follows the mouse on fine-pointer desktops.
  const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  if(finePointer.matches&&!reduce.matches){
    const ring=document.createElement('div');
    ring.className='cursor-ring';
    ring.setAttribute('aria-hidden','true');
    document.body.appendChild(ring);
    let x=0,y=0,cx=0,cy=0,running=false,visible=false;
    const interactive='a,button,input,select,textarea,summary,label,[role="button"],.resource-card,.career-card,.category-tab';
    function stopRing(){
      visible=false;
      ring.classList.remove('is-visible','is-active');
      if(running){cancelAnimationFrame(running);running=0;}
    }
    function frame(){
      if(root.classList.contains('motion-paused')){stopRing();return;}
      cx+=(x-cx)*.2;cy+=(y-cy)*.2;
      ring.style.transform=`translate3d(${cx}px,${cy}px,0) translate(-50%,-50%)`;
      running=requestAnimationFrame(frame);
    }
    window.addEventListener('pointermove',event=>{
      if(event.pointerType&&event.pointerType!=='mouse')return;
      if(root.classList.contains('motion-paused'))return;
      x=event.clientX;y=event.clientY;
      if(!visible){visible=true;ring.classList.add('is-visible');}
      if(!running)running=requestAnimationFrame(frame);
    },{passive:true});
    document.addEventListener('mouseleave',stopRing);
    document.addEventListener('mouseenter',()=>{if(!root.classList.contains('motion-paused')){visible=true;ring.classList.add('is-visible');}});
    document.addEventListener('pointerover',event=>{
      if(event.target.closest?.(interactive))ring.classList.add('is-active');
    });
    document.addEventListener('pointerout',event=>{
      if(event.target.closest?.(interactive)&&!event.relatedTarget?.closest?.(interactive))ring.classList.remove('is-active');
    });
  }
})();

/** Blocking micro-script in <head>: marks the document as scripted before first paint so the reveal animations can start hidden (without JavaScript everything is visible). */
document.documentElement.classList.add('js');
if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('rm');

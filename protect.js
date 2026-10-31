/* ═══════════════════════════════════════════════════════════════════════════
   CRM PROTECTION — blocks right-click and view-source shortcuts on desktop

   ⚠️  SIZE-BASED DEVTOOLS DETECTOR REMOVED — same reason as public/protect.js:
   It false-positives on every mobile browser (Safari iOS, Chrome Android).
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12') { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) {
      e.preventDefault(); return false;
    }
    if (e.ctrlKey && ['U','u','S','s','P','p'].includes(e.key)) {
      e.preventDefault(); return false;
    }
  });

  console.log('%c⛔ CRM система — доступ ограничен', 'color:#EF4444;font-size:20px;font-weight:bold;');

})();

import { useEffect, useState } from 'react';

const SCROLL_THRESHOLD = 120; // px scrolled before the panel reveals itself automatically

// In-page "jump to section" nav for tabs with several stacked cards — as tabs get combined into
// longer pages, this answers "what's further down" without blind scrolling. Closed by default;
// reveals itself once the user scrolls past SCROLL_THRESHOLD, or via the toggle button at any
// time (the button's manual state and the scroll-driven state are OR'd together, so scrolling
// back to the top only auto-hides it if the user hasn't pinned it open manually).
export default function SectionNav({ sections }) {
  const [scrolled, setScrolled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const [active, setActive] = useState(sections?.[0]?.id || null);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Highlights whichever section is currently nearest the top of the viewport, so the nav
  // reflects scroll position even when the user scrolls manually instead of clicking a link.
  useEffect(() => {
    if (!sections?.length) return;
    function handleActive() {
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) current = s.id;
      }
      setActive(current);
    }
    handleActive();
    window.addEventListener('scroll', handleActive, { passive: true });
    return () => window.removeEventListener('scroll', handleActive);
  }, [sections]);

  if (!sections || sections.length === 0) return null;
  const open = scrolled || manuallyOpen;

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <div
        className={`fixed top-1/2 -translate-y-1/2 left-0 z-40 bg-black text-white rounded-r-lg shadow-xl transition-transform duration-200 max-h-[70vh] overflow-y-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="py-3 px-1 min-w-[180px]">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-white">On this page</div>
          <nav className="flex flex-col">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`text-left px-3 py-1.5 text-xs transition-colors whitespace-nowrap border-l-2 ${
                  active === s.id ? 'bg-white/10 text-white font-medium border-accent' : 'text-white/70 hover:bg-white/10 hover:text-white border-transparent'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <button
        onClick={() => setManuallyOpen(o => !o)}
        title={open ? 'Hide section menu' : 'Show section menu'}
        className="fixed bottom-4 left-4 z-40 w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shadow-lg hover:bg-black/80 transition-colors text-sm"
      >
        {open ? '‹' : '›'}
      </button>
    </>
  );
}

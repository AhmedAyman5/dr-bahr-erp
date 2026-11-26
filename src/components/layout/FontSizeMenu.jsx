// Header button "حجم الخط": a small menu with صغير · متوسط · كبير (the current one has a check).
// The size itself lives in utils/fontSize.js (root font size on <html>, saved on this device).
//
// Keyboard: Enter / Space opens the menu and focuses the current option, ↑ / ↓ / Home / End move,
// Enter / Space choose, Escape closes (focus goes back to the button), Tab closes and moves on.
// A click outside closes it too.
import { useEffect, useRef, useState } from "react";
import { ALargeSmall, Check } from "lucide-react";
import { FONT_SIZES, getFontSize, setFontSize } from "../../utils/fontSize";
import Button from "../ui/Button";

function FontSizeMenu() {
  const [current, setCurrent] = useState(getFontSize);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // While open: a click outside or Escape closes the menu.
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event) {
      if (!wrapperRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current.focus();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(value) {
    setFontSize(value);
    setCurrent(value);
    setOpen(false);
    buttonRef.current.focus();
  }

  // Arrow keys move between the options; Tab leaves the menu (and closes it).
  function handleMenuKeyDown(event) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const options = [...menuRef.current.querySelectorAll('[role="menuitemradio"]')];
    const index = options.indexOf(document.activeElement);
    const last = options.length - 1;
    const nextIndex = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index <= 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];

    if (nextIndex !== undefined) {
      event.preventDefault();
      options[nextIndex].focus();
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        className="px-2"
        title="حجم الخط"
        aria-label="حجم الخط"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ALargeSmall size={20} />
      </Button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="حجم الخط"
          onKeyDown={handleMenuKeyDown}
          className="absolute start-0 top-full z-40 mt-2 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {FONT_SIZES.map((size) => {
            const checked = size.value === current;
            return (
              <button
                key={size.value}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                // The current option gets the focus when the menu opens (keyboard users start there).
                autoFocus={checked}
                onClick={() => choose(size.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm outline-none hover:bg-slate-100 focus-visible:bg-slate-100 ${
                  checked ? "font-semibold text-primary" : "text-slate-700"
                }`}
              >
                {/* The check keeps its place (invisible) on the other options, so the labels line up. */}
                <Check size={16} className={checked ? "" : "invisible"} />
                {size.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FontSizeMenu;

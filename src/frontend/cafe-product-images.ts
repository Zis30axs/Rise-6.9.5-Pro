/** Flat cup icons for the cafe menu. Item ids are fixed; nothing here reads a save or a URL. */
function icon(markup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">${markup}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const cup = (body: string, foam: string, extra = '') => icon(
  `<path d="M14 28h32l3 36a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8z" fill="${body}" stroke="#3b2a22" stroke-width="2"/>
   <path d="M46 34h6a8 8 0 0 1 0 16h-6" fill="none" stroke="#3b2a22" stroke-width="2"/>
   <ellipse cx="30" cy="28" rx="16" ry="6" fill="${foam}" stroke="#3b2a22" stroke-width="2"/>${extra}`,
);

const cone = (liquid: string, extra = '') => icon(
  `<path d="M18 18h28l-8 28H26z" fill="${liquid}" stroke="#3b2a22" stroke-width="2"/>
   <path d="M22 46h20l-6 16h-8z" fill="#f4efe6" stroke="#3b2a22" stroke-width="2"/>
   <path d="M24 22h16" fill="none" stroke="#f7f1e6" stroke-width="2"/>${extra}`,
);

export const cafeProductImages: Readonly<Record<string, string>> = Object.freeze({
  'cafe-espresso': cup('#4a2b22', '#c9843a', '<ellipse cx="30" cy="28" rx="6" ry="2" fill="#e7c27a"/>'),
  'cafe-americano': icon(
    `<path d="M18 20h24l4 46H14z" fill="#d7b48a" stroke="#3b2a22" stroke-width="2"/>
     <path d="M20 28h20M18 40h24" fill="none" stroke="#f3e6d0" stroke-width="2" opacity=".7"/>`,
  ),
  'cafe-latte': cup('#f4e7d6', '#fffaf4', '<path d="M30 26c2 2 2 2 0 4-2-2-2-2 0-4z" fill="#e7b7c2"/>'),
  'cafe-cappuccino': cup('#f7f1e8', '#fff', '<circle cx="24" cy="27" r="1.4" fill="#6b3e2a"/><circle cx="32" cy="29" r="1.4" fill="#6b3e2a"/><circle cx="28" cy="25" r="1.2" fill="#6b3e2a"/>'),
  'cafe-mocha': cup('#6d3b2c', '#4a2a22', '<path d="M22 34c4 6 12 6 16 0" fill="none" stroke="#e7c27a" stroke-width="2"/>'),
  'cafe-pourover': cone('#c47a45'),
  'cafe-single-origin': cone('#a8643a', '<ellipse cx="46" cy="58" rx="6" ry="4" fill="#6b3e2a" transform="rotate(-20 46 58)"/>'),
  'cafe-matcha-latte': cup('#dfe8cf', '#9db56d', '<circle cx="30" cy="28" r="3" fill="#6e8f45"/>'),
  'cafe-special-citrus': cup('#f3d48a', '#fff6df', '<circle cx="44" cy="62" r="6" fill="#efb13a" stroke="#3b2a22" stroke-width="2"/>'),
  'cafe-special-brown-sugar': cup('#8d5a34', '#5c3a24', '<path d="M24 48h12" stroke="#e7c27a" stroke-width="2"/>'),
  'cafe-special-osmanthus': cup('#f6e3b0', '#fff8e8', '<circle cx="26" cy="40" r="2" fill="#e0a63a"/><circle cx="34" cy="46" r="2" fill="#e0a63a"/>'),
  'cafe-special-charcoal': cup('#3e342f', '#2a2422', '<path d="M22 36h16" stroke="#d7c4a4" stroke-width="2"/>'),
  'cafe-special-sea-salt': cup('#efe4d6', '#fff', '<circle cx="40" cy="44" r="3" fill="#d5e4ea" stroke="#3b2a22" stroke-width="1.5"/>'),
  'cafe-special-rose': cup('#f3d5df', '#fff5f7', '<path d="M30 38c3-4 6 0 0 6-6-6-3-10 0-6z" fill="#d36b8a"/>'),
  'cafe-emma-sakura': cup('#f7c3d2', '#fff0f4', '<path d="M44 20c3-4 8-2 6 2-4 1-6 0-6-2z" fill="#f4a4ba" stroke="#3b2a22" stroke-width="1.4"/>'),
});

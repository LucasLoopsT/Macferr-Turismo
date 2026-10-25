// Logo original da MacFerr, mantido sem alterações no desenho.
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 40C22 40 13 29 13 20C13 15.03 17.03 11 22 11C26.97 11 31 15.03 31 20C31 29 22 40 22 40Z" fill="#9B59B6" opacity="0.85" />
      <circle cx="22" cy="20" r="4.5" fill="#7B2FBE" />
      <path d="M9 18.5L35 14L33 20L35 26L9 21.5L13.5 20Z" fill="#1a1a6e" />
      <path d="M20.5 20L22.5 12.5L24.5 13.5L22.5 21Z" fill="#1a1a6e" opacity="0.65" />
      <path d="M20.5 20L22.5 27.5L24 27L22.5 21Z" fill="#1a1a6e" opacity="0.45" />
    </svg>
  );
}

import logo from '../imgs/logo.png';


export function Logo({ tone = 'dark', size = 44 }: { tone?: 'dark' | 'light'; size?: number }) {
  const claro = tone === 'light';
  return (
    <span className="flex items-center gap-3">
      <span className={`flex items-center justify-center rounded-xl ${claro ? 'bg-white p-1' : ''}`}>
      <img src={logo.src} alt="MacFerr Turismo" className="w-20 h-20 object-contain"/>
      </span>
      <span className="leading-none">
        <span className={`block font-display text-xl font-extrabold ${claro ? 'text-white' : 'text-slate-900'}`}>Mac Ferr</span>
        <span className={`mt-1 block text-sm font-semibold ${claro ? 'text-violet-300' : 'text-violet-600'}`}>Turismo</span>
      </span>
    </span>
  );
}

// Device chrome: status bar, home indicator, device bezel (for play mode & renders)
import { parseColor } from './project.js';

function isDark(color) {
  const c = parseColor(color || '#000');
  if (!c) return true;
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 128;
}

function fgOf(mode, textColor) {
  return /\blight\b/.test(mode) ? '#fff' : /\bdark\b/.test(mode) ? '#000' : (isDark(textColor) ? '#000' : '#fff');
}

export function makeStatusBar(mode, device, textColor, bg) {
  const el = document.createElement('div');
  el.className = 'mq-statusbar';
  const fg = fgOf(mode, textColor);
  const out = device && device.os === 'android' ? androidStatusBar(el, fg, device) : iosStatusBar(el, fg, device);
  // statusbar=blur: a material veil of the screen's background, so content scrolling underneath stays legible
  if (/\bblur\b/.test(mode)) {
    const c = parseColor(bg || (isDark(textColor) ? '#fff' : '#000')) || [255, 255, 255, 1];
    out.style.background = `rgba(${c[0]},${c[1]},${c[2]},.78)`;
    out.style.backdropFilter = out.style.webkitBackdropFilter = 'blur(20px) saturate(1.8)';
  }
  return out;
}

function iosStatusBar(el, fg, device) {
  const h = device && device.safeTop ? Math.min(device.safeTop, 54) : 44;
  el.style.cssText = `position:absolute;left:0;right:0;top:0;height:${h}px;display:flex;align-items:center;justify-content:space-between;padding:6px 32px 0 40px;color:${fg};font:600 16px/1 Inter,-apple-system,system-ui,sans-serif;pointer-events:none;z-index:9000;letter-spacing:-.2px`;
  const sig = `<svg width="18" height="12" viewBox="0 0 18 12" fill="${fg}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>`;
  const wifi = `<svg width="16" height="12" viewBox="0 0 16 12" fill="${fg}"><path d="M8 2.6c2.2 0 4.2.8 5.7 2.2l1.2-1.3A10 10 0 0 0 8 .8 10 10 0 0 0 1.1 3.5l1.2 1.3A8.3 8.3 0 0 1 8 2.6Zm0 3.5c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4.3c-1.8 0-3.4.7-4.6 1.8l1.2 1.3C5.5 6.6 6.7 6.1 8 6.1Zm0 3.4c-.6 0-1.1.2-1.5.6L8 11.8l1.5-1.7c-.4-.4-.9-.6-1.5-.6Z"/></svg>`;
  const bat = `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="${fg}" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2" fill="${fg}"/><path d="M24.5 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="${fg}" opacity=".45"/></svg>`;
  el.innerHTML = `<span>9:41</span><span style="display:flex;gap:6px;align-items:center">${sig}${wifi}${bat}</span>`;
  return el;
}

// Android : heure à gauche (Roboto), icônes système à droite ; One UI (Samsung) ajoute le pourcentage de batterie
// et une batterie horizontale, Pixel une batterie verticale. La caméra poinçonnée reste au milieu, libre.
function androidStatusBar(el, fg, device) {
  const h = device.safeTop || 32;
  const samsung = device.oem === 'samsung';
  el.style.cssText = `position:absolute;left:0;right:0;top:0;height:${h}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${samsung ? 20 : 24}px;color:${fg};font:500 ${samsung ? 13 : 14}px/1 Roboto,'Google Sans','SamsungOne',Inter,system-ui,sans-serif;pointer-events:none;z-index:9000;letter-spacing:.1px`;
  const wifi = `<svg width="16" height="14" viewBox="0 0 16 14" fill="${fg}"><path d="M8 13.4 0 3.6A12.6 12.6 0 0 1 8 .8c3 0 5.8 1 8 2.8L8 13.4Z"/></svg>`;
  const sig = `<svg width="14" height="14" viewBox="0 0 14 14" fill="${fg}"><path d="M14 0v14H0L14 0Z"/></svg>`;
  const bat = samsung
    ? `<svg width="22" height="12" viewBox="0 0 22 12"><rect x=".75" y=".75" width="18.5" height="10.5" rx="3" fill="none" stroke="${fg}" stroke-width="1.5"/><rect x="3" y="3" width="12" height="6" rx="1.2" fill="${fg}"/><rect x="20.2" y="4" width="1.6" height="4" rx=".8" fill="${fg}"/></svg>`
    : `<svg width="9" height="15" viewBox="0 0 9 15" fill="${fg}"><rect x="2.5" y="0" width="4" height="2" rx=".5"/><rect x="0" y="1.5" width="9" height="13.5" rx="1.5" opacity=".35"/><rect x="0" y="4.5" width="9" height="10.5" rx="1.5"/></svg>`;
  el.innerHTML = `<span>9:30</span><span style="display:flex;gap:${samsung ? 5 : 6}px;align-items:center">${wifi}${sig}${samsung ? '<span style="font-size:12px">86%</span>' : ''}${bat}</span>`;
  return el;
}

// homebar : indicateur iOS, ou sur Android la poignée de navigation par gestes ; homebar=buttons → barre 3 boutons
// (Samsung : récents · accueil · retour, Pixel : retour · accueil · récents) ; ajouter light/dark pour forcer la couleur
export function makeHomeBar(mode, textColor, device) {
  const el = document.createElement('div');
  el.className = 'mq-homebar';
  const fg = fgOf(mode, textColor);
  if (device && device.os === 'android') {
    if (/\bbuttons\b/.test(mode)) {
      const samsung = device.oem === 'samsung';
      const back = samsung
        ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4 6.5 10l6 6"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 18 18" fill="${fg}"><path d="M3 9 14 2.5v13L3 9Z"/></svg>`;
      const home = samsung
        ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${fg}" stroke-width="2"><rect x="3" y="3" width="14" height="14" rx="5"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 20 20" fill="${fg}"><circle cx="10" cy="10" r="8"/></svg>`;
      const recents = samsung
        ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round"><path d="M5 5v10M10 5v10M15 5v10"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 18 18" fill="${fg}"><rect x="2.5" y="2.5" width="13" height="13" rx="1.5"/></svg>`;
      const order = samsung ? [recents, home, back] : [back, home, recents];
      el.style.cssText = `position:absolute;left:0;right:0;bottom:0;height:48px;display:flex;align-items:center;justify-content:space-around;padding:0 ${samsung ? 40 : 56}px;pointer-events:none;z-index:9000;opacity:${samsung ? .9 : .8}`;
      el.innerHTML = order.map((s) => `<span style="width:48px;height:48px;display:grid;place-items:center">${s}</span>`).join('');
      return el;
    }
    el.style.cssText = `position:absolute;left:50%;bottom:10px;width:${device.oem === 'samsung' ? 96 : 108}px;height:4px;border-radius:2px;background:${fg};opacity:.9;transform:translateX(-50%);pointer-events:none;z-index:9000`;
    return el;
  }
  el.style.cssText = `position:absolute;left:50%;bottom:8px;width:134px;height:5px;border-radius:3px;background:${fg};transform:translateX(-50%);pointer-events:none;z-index:9000`;
  return el;
}

// Wraps a screen element in a realistic device bezel
export function deviceFrame(device, screenEl, { w, h }) {
  const wrap = document.createElement('div');
  wrap.className = 'mq-device';
  if (!device || device.kind === 'desktop' || device.kind === 'social' || !device.radius) {
    wrap.style.cssText = `position:relative;width:${w}px;height:${h}px;border-radius:${device && device.kind === 'desktop' ? 12 : 8}px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.45)`;
    if (device && device.kind === 'desktop') {
      const bar = document.createElement('div');
      bar.style.cssText = 'height:36px;background:#1e1f24;display:flex;align-items:center;gap:8px;padding:0 14px';
      bar.innerHTML = '<i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i><span style="flex:1;margin:0 80px;height:22px;border-radius:6px;background:#2c2d33"></span>';
      wrap.style.height = h + 36 + 'px';
      wrap.appendChild(bar);
    }
    wrap.appendChild(screenEl);
    return wrap;
  }
  const android = device.os === 'android', samsung = device.oem === 'samsung';
  // Android : bords plus fins et plus plats (Galaxy : cadre titane gris, Pixel : aluminium mat)
  const bez = device.kind === 'tablet' ? (android ? 14 : 18) : device.kind === 'watch' ? 14 : android ? (samsung ? 8 : 10) : 12;
  const metal = samsung ? 'linear-gradient(145deg,#4a4c52,#1c1d21 45%,#2e3035)' : android ? 'linear-gradient(145deg,#33353a,#121316)' : 'linear-gradient(145deg,#2a2b30,#0d0d10)';
  const rim = samsung ? 'inset 0 0 0 1.5px #6a6d75,inset 0 0 0 4px #0b0b0d' : 'inset 0 0 0 2px #3a3b42,inset 0 0 0 5px #111';
  wrap.style.cssText = `position:relative;padding:${bez}px;border-radius:${device.radius + bez}px;background:${metal};box-shadow:${rim},0 40px 100px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.06)`;
  const inner = document.createElement('div');
  inner.style.cssText = `position:relative;width:${w}px;height:${h}px;border-radius:${device.radius}px;overflow:hidden;isolation:isolate;background:#000`;
  inner.appendChild(screenEl);
  if (device.island) {
    const isl = document.createElement('div');
    isl.style.cssText = 'position:absolute;top:11px;left:50%;transform:translateX(-50%);width:124px;height:36px;border-radius:20px;background:#000;z-index:9999;pointer-events:none';
    inner.appendChild(isl);
  } else if (device.notch) {
    const n = document.createElement('div');
    n.style.cssText = 'position:absolute;top:0;left:50%;transform:translateX(-50%);width:160px;height:30px;border-radius:0 0 18px 18px;background:#000;z-index:9999;pointer-events:none';
    inner.appendChild(n);
  } else if (device.punch) {
    // caméra poinçonnée centrée dans la barre d'état (Fold : au centre du panneau droit)
    const n = document.createElement('div'); const d = device.cam || 12;
    const top = Math.round(((device.safeTop || 32) - d) / 2);
    n.style.cssText = `position:absolute;top:${top}px;left:${(device.camX ?? 0.5) * 100}%;transform:translateX(-50%);width:${d}px;height:${d}px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#1d2433 0 22%,#050506 40%);box-shadow:0 0 0 1.5px #0a0a0b;z-index:9999;pointer-events:none`;
    inner.appendChild(n);
  }
  wrap.appendChild(inner);
  wrap._screenHost = inner;
  return wrap;
}

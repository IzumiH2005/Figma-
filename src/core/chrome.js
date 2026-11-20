// Device chrome: status bar, home indicator, device bezel (for play mode & renders)
import { parseColor } from './project.js';

function isDark(color) {
  const c = parseColor(color || '#000');
  if (!c) return true;
  return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 128;
}

export function makeStatusBar(mode, device, textColor) {
  const el = document.createElement('div');
  el.className = 'mq-statusbar';
  const fg = mode === 'light' ? '#fff' : mode === 'dark' ? '#000' : (isDark(textColor) ? '#000' : '#fff');
  const h = device && device.safeTop ? Math.min(device.safeTop, 54) : 44;
  const android = device && device.punch;
  el.style.cssText = `position:absolute;left:0;right:0;top:0;height:${h}px;display:flex;align-items:center;justify-content:space-between;padding:${android ? '0 22px' : '6px 32px 0 40px'};color:${fg};font:600 ${android ? 14 : 16}px/1 Inter,-apple-system,system-ui,sans-serif;pointer-events:none;z-index:9000;letter-spacing:-.2px`;
  const sig = `<svg width="18" height="12" viewBox="0 0 18 12" fill="${fg}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>`;
  const wifi = `<svg width="16" height="12" viewBox="0 0 16 12" fill="${fg}"><path d="M8 2.6c2.2 0 4.2.8 5.7 2.2l1.2-1.3A10 10 0 0 0 8 .8 10 10 0 0 0 1.1 3.5l1.2 1.3A8.3 8.3 0 0 1 8 2.6Zm0 3.5c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4.3c-1.8 0-3.4.7-4.6 1.8l1.2 1.3C5.5 6.6 6.7 6.1 8 6.1Zm0 3.4c-.6 0-1.1.2-1.5.6L8 11.8l1.5-1.7c-.4-.4-.9-.6-1.5-.6Z"/></svg>`;
  const bat = `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="${fg}" opacity=".4"/><rect x="2" y="2" width="19" height="9" rx="2" fill="${fg}"/><path d="M24.5 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="${fg}" opacity=".45"/></svg>`;
  el.innerHTML = `<span>9:41</span><span style="display:flex;gap:6px;align-items:center">${sig}${wifi}${bat}</span>`;
  return el;
}

export function makeHomeBar(mode, textColor) {
  const el = document.createElement('div');
  el.className = 'mq-homebar';
  const fg = mode === 'light' ? '#fff' : mode === 'dark' ? '#000' : (isDark(textColor) ? '#000' : '#fff');
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
  const bez = device.kind === 'tablet' ? 18 : device.kind === 'watch' ? 14 : 12;
  wrap.style.cssText = `position:relative;padding:${bez}px;border-radius:${device.radius + bez}px;background:linear-gradient(145deg,#2a2b30,#0d0d10);box-shadow:inset 0 0 0 2px #3a3b42,inset 0 0 0 5px #111,0 40px 100px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.06)`;
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
    const n = document.createElement('div');
    n.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;background:#000;z-index:9999;pointer-events:none';
    inner.appendChild(n);
  }
  wrap.appendChild(inner);
  wrap._screenHost = inner;
  return wrap;
}

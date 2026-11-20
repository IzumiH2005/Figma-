// Generated style guide: a .mq screen documenting a design system with the real (linked) components.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const D = '$'; // token sigil (kept apart so templates stay readable)

export function styleGuideSource(sys, name = 'Design system') {
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  const t = (k) => D + k;
  const ramps = sys.ramps.map((r) => [
    '        <col gap=6 w=fill>',
    `          <text size=12 weight=600 color=${t('muted')} upper ls=6%>${r}</text>`,
    '          <row w=fill gap=4>' + STEPS.map((s) => `<col w=fill gap=4><frame h=40 radius=${t('radius-sm')} fill=${t(`${r}-${s}`)}/><text size=11 color=${t('muted')} mono>${s}</text></col>`).join('') + '</row>',
    '        </col>',
  ].join('\n')).join('\n');
  const roles = ['primary', 'accent', 'success', 'warning', 'danger', 'info'].filter((r) => sys.light[r]);
  const swatches = roles.map((r) => {
    const ck = sys.checks.find((c) => c.mode === 'light' && c.fg === `on-${r}`);
    return [
      `          <col w=fill gap=0 radius=${t('radius-lg')} clip fill=${t('surface')} shadow=${t('shadow-1')}>`,
      `            <row h=72 px=16 fill=${t(r)} color=${t('on-' + r)} justify=between><text weight=600>${r}</text><text size=12 mono>${ck ? ck.ratio + ':1 AA' : ''}</text></row>`,
      `            <row h=40 px=16 fill=${t(r + '-soft')} color=${t(r + '-text')}><text size=13 weight=500>${r}-soft · ${r}-text</text></row>`,
      '          </col>',
    ].join('\n');
  }).join('\n');
  const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'].map((k) => `<col w=fill gap=6><frame h=56 radius=${t('radius-md')} fill=${t(k)} shadow=${t('shadow-1')}/><text size=12 color=${t('muted')} mono>${D}${k}</text></col>`).join('');
  const big = ['5xl', '4xl', '3xl', '2xl'];
  const type = ['5xl', '4xl', '3xl', '2xl', 'xl', 'lg', 'base', 'sm', 'xs'].map((k) => `<row gap=16 align=baseline><text w=88 size=12 color=${t('muted')} mono>${k} · ${sys.scales['text-' + k]}</text><text size=${t('text-' + k)} weight=${big.includes(k) ? 700 : 500} font=${t(big.slice(0, 3).includes(k) ? 'font-display' : 'font-sans')} lh=1.15 nowrap>Le système, en douceur</text></row>`).join('\n          ');
  const space = Array.from({ length: 10 }, (_, i) => `<row gap=12><text w=72 size=12 color=${t('muted')} mono>space-${i + 1}</text><frame w=${Math.min(320, +sys.scales['space-' + (i + 1)] * 3)} h=12 radius=4 fill=${t('primary-soft')}/><text size=12 color=${t('muted')} mono>${sys.scales['space-' + (i + 1)]}</text></row>`).join('\n          ');
  const radii = ['sm', 'md', 'lg', 'xl', 'full'].map((k) => `<col gap=6 center><frame w=72 h=72 radius=${t('radius-' + k)} fill=${t('primary-soft')}/><text size=12 color=${t('muted')} mono>${k}</text></col>`).join('');
  const elev = [1, 2, 3, 4].map((i) => `<col w=fill h=96 radius=${t('radius-lg')} fill=${t('surface')} shadow=${t('shadow-' + i)} center><text size=13 color=${t('muted')} mono>shadow-${i}</text></col>`).join('');
  const motion = [['fast', 'snap'], ['base', 'smooth'], ['slow', 'cushion']].map(([d, e]) => [
    `<col w=fill gap=8 p=16 radius=${t('radius-lg')} fill=${t('surface')}>`,
    `            <text size=12 color=${t('muted')} mono>dur-${d} · ${sys.scales['dur-' + d]}ms · ${e}</text>`,
    `            <frame w=40 h=40 radius=${t('radius-md')} fill=${t('primary')} anim="fade-right ${sys.scales['dur-' + d]} ${e}"/>`,
    '          </col>',
  ].join('\n')).join('\n          ');
  return `
  <screen name="${esc(name)}" device=desktop h=auto fill=${t('bg')} color=${t('text')} font=${t('font-sans')}>
    <col w=fill maxw=1120 mx=auto px=48 py=64 gap=64>
      <col gap=12 motion=cascade>
        <text size=12 weight=600 color=${t('primary-text')} upper ls=8%>Design system</text>
        <text size=${t('text-4xl')} weight=700 font=${t('font-display')} lh=1.05>${esc(name)}</text>
        <text size=${t('text-lg')} color=${t('muted')} maxw=640 lh=1.5>Primitives, puis rôles sémantiques, puis composants. Chaque rôle est vérifié au contraste AA en clair et en sombre ; les composants lisent ces tokens.</text>
      </col>
      <col gap=20><text size=${t('text-xl')} weight=600>Primitives</text>
${ramps}
      </col>
      <col gap=20><text size=${t('text-xl')} weight=600>Rôles sémantiques</text>
        <grid cols=3 gap=16 w=fill>
${swatches}
        </grid>
        <row w=fill gap=12>${surfaces}</row>
      </col>
      <col gap=16 w=fill><text size=${t('text-xl')} weight=600>Typographie</text>
          ${type}
      </col>
      <grid cols=2 gap=48 w=fill align=start>
        <col gap=12><text size=${t('text-xl')} weight=600>Espacements</text>
          ${space}
        </col>
        <col gap=20><text size=${t('text-xl')} weight=600>Rayons</text><row gap=20 wrap>${radii}</row></col>
      </grid>
      <col gap=20><text size=${t('text-xl')} weight=600>Élévation</text><row w=fill gap=24>${elev}</row></col>
      <col gap=20><text size=${t('text-xl')} weight=600>Motion</text><row w=fill gap=16>
          ${motion}
        </row></col>
      <col gap=20><text size=${t('text-xl')} weight=600>Composants liés au système</text>
        <row gap=12 wrap><Button label="Continuer" iconRight=arrow-right/><Button label="Secondaire" kind=secondary/><Button label="Tonal" kind=tonal/><Button label="Contour" kind=outline/><Button label="Supprimer" kind=danger icon=trash-2/></row>
        <grid cols=3 gap=16 w=fill align=start>
          <Card><text weight=600>Carte</text><text color=${t('muted')} size=14 lh=1.5>Rayon card-radius, padding card-pad, fond surface.</text><row gap=8><Chip label="Design" selected/><Chip label="Produit"/></row></Card>
          <col gap=12><Field label="E-mail" placeholder="vous@exemple.fr" icon=mail/><Field label="Mot de passe" placeholder="8 caractères minimum" error="Au moins 8 caractères"/></col>
          <col gap=12><Alert tone=success title="Enregistré" text="Vos modifications sont en ligne." close=false/><Alert tone=warning title="Attention" text="Le quota approche." close=false/></col>
        </grid>
      </col>
    </col>
  </screen>`;
}

/* =====================================================================
   b'steuern Signatur-Generator  ·  v2
   Aenderungen gegenueber dem Prototyp:
   M1  Kein Data-URI mehr. Die Signatur verlinkt genau ein gehostetes PNG.
   M2  Erfolgsmeldung nur nach bestandener Bildpruefung. Getrennte Statusfelder.
   M3  Alle Personenfelder starten leer. Kopieren erst bei vollstaendigen Angaben.
   M4  Kanzleiangaben zentral konfigurierbar, Platzhalter blockieren das Tool.
   Keine Abhaengigkeiten, kein localStorage.
   ===================================================================== */
(function(){
  'use strict';

  /* =================================================================
     KONFIGURATION  ·  hier und nur hier wird gepflegt
     ================================================================= */

  /* Ordner mit den 175 Emblem-PNGs. Muss mit / enden.
     Diese Adresse steht spaeter in tausenden versendeten Mails.
     Sie darf sich nie wieder aendern. */
  /* Standard ist der Ordner neben dieser Datei. So laeuft der Prototyp
     sofort, ohne Hosting. Fuer den echten Betrieb wird diese Adresse in
     der Webflow-Seite ueber window.BSTEUERN_SIG_CONFIG.emblemBase auf
     eine https-Adresse gesetzt. Solange sie das nicht ist, ist das
     Kopieren gesperrt. */
  var EMBLEM_BASE = 'embleme/';

  /* Kanzleiangaben. Jeder Wert mit einem Platzhalter in
     Guillemets blockiert das Kopieren, bis er ersetzt ist. */
  var KANZLEI = {
    /* Vollstaendige eingetragene Firma. Traegt sie einen
       berufsrechtlichen Zusatz, muss er hier stehen. */
    firma:    '«Vollstaendige eingetragene Firma»',
    adresse:  'Neue Schönhauser Straße 1B, 10178 Berlin',
    register: 'Amtsgericht Charlottenburg HRB 271912',

    /* § 35a GmbHG: Familienname und mindestens ein
       ausgeschriebener Vorname je Geschaeftsfuehrer. */
    fuehrung: 'Geschäftsführer: «Vorname» Gößmann-Schmitt, Christopher Plantener, «Vorname» Ogden',

    zeigeKammer:      true,
    kammer:           'Zuständige Aufsichtsbehörde: «Steuerberaterkammer»',

    zeigeDatenschutz: true,
    datenschutzText:  'Datenschutzhinweise',
    datenschutzUrl:   'https://bsteuern.com/datenschutz',

    website:     'bsteuern.com',
    websiteUrl:  'https://bsteuern.com',
    webTail:     'radikal anders, digital & selbstorganisiert',

    /* Standardtext der Terminzeile. Ansprache Du. */
    ctaText:     'Buch dir einen Termin bei mir',
    ctaUrl:      'https://bsteuern.com/termin',

    mailDomain:  'bsteuern.com'
  };

  /* --- Ueberschreibung aus der Seite --------------------------------
     Wenn die Seite vor dem Laden dieser Datei ein Objekt
     window.BSTEUERN_SIG_CONFIG setzt, gewinnen dessen Werte.
     So aendert ihr Rechtstexte in Webflow, ohne neuen Commit
     und ohne neuen jsDelivr-Hash. ------------------------------------ */
  var OVR = window.BSTEUERN_SIG_CONFIG || {};
  if(typeof OVR.emblemBase === 'string' && OVR.emblemBase) EMBLEM_BASE = OVR.emblemBase;
  if(OVR.kanzlei) for(var _k in OVR.kanzlei) KANZLEI[_k] = OVR.kanzlei[_k];
  if(EMBLEM_BASE.slice(-1) !== '/') EMBLEM_BASE += '/';

  /* Feste-Adressen-Modus.
     Wer keine 175 Dateien mit berechenbarem Pfad hosten kann, hinterlegt
     stattdessen genau eine Adresse je Farbe:
       emblemUrls: { ind:'https://...', ind50:'...', lem:'...', trq:'...', crm:'...' }
     Dann entfaellt die Emblem-Auswahl, jede Farbe hat ein festes Motiv. */
  var EMBLEM_URLS = OVR.emblemUrls || null;
  var FIXED_MODE  = !!EMBLEM_URLS;

  var PALETTE = [
    { key:'IND',   label:'Indigo',     hex:'#3D2BD5' },
    { key:'IND50', label:'Indigo 50%', hex:'rgb(158,149,234)' },
    { key:'LEM',   label:'Lemon',      hex:'#F6DF35' },
    { key:'TRQ',   label:'Türkis',     hex:'#00A1AA' },
    { key:'CRM',   label:'Crimson',    hex:'#FF0670' }
  ];
  var PATTERN_COUNT = 35;
  var FONT = "'General Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

  /* =================================================================
     Hilfsfunktionen
     ================================================================= */

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function hash(str){
    var h = 0;
    for(var i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function safeUrl(u){
    u = String(u || '').trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function emblemFile(pi, ci){
    return 'emblem-' + ('0'+pi).slice(-2) + '-' + PALETTE[ci].key.toLowerCase() + '-2x.png';
  }
  function el(tag, attrs, kids){
    var n = document.createElement(tag);
    if(attrs) for(var k in attrs){
      if(k === 'text') n.textContent = attrs[k];
      else if(k === 'html') n.innerHTML = attrs[k];
      else if(k === 'class') n.className = attrs[k];
      else if(k.slice(0,2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if(attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function(c){ if(c) n.appendChild(c); });
    return n;
  }

  /* Platzhalter in der Konfiguration finden */
  function configHoles(){
    var out = [];
    ['firma','adresse','register','fuehrung'].forEach(function(k){
      if(String(KANZLEI[k]).indexOf('«') > -1) out.push(k);
    });
    if(KANZLEI.zeigeKammer && String(KANZLEI.kammer).indexOf('«') > -1) out.push('kammer');
    if(EMBLEM_BASE.indexOf('«') > -1) out.push('EMBLEM_BASE');
    return out;
  }

  /* =================================================================
     Zustand
     ================================================================= */

  var S = {
    name:'', role:'', phone:'', email:'',
    ctaText: KANZLEI.ctaText,
    ctaUrl:  KANZLEI.ctaUrl,
    showRole:true, showPhone:true, showCta:true,
    colorIndex:0,
    emblemPick:null,
    emblemsOpen:false,
    variant:'full',
    client:'gmail',
    stage:1,
    finished:false,
    imgState:'idle'   /* idle | checking | ok | fail */
  };

  function emblemIndex(){
    if(S.emblemPick !== null) return S.emblemPick;
    return hash(S.name || 'b') % PATTERN_COUNT;
  }
  function emblemUrl(){
    if(FIXED_MODE) return String(EMBLEM_URLS[PALETTE[S.colorIndex].key.toLowerCase()] || '');
    return EMBLEM_BASE + emblemFile(emblemIndex(), S.colorIndex);
  }

  /* =================================================================
     Freigabe-Logik (M2 + M3)
     ================================================================= */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

  function blockers(){
    var b = [];
    var holes = configHoles();
    if(holes.length) b.push({ k:'config', t:'Die Kanzleiangaben sind noch nicht freigegeben. Offen: ' + holes.join(', ') + '. Bitte an Chris.' });
    if(S.name.trim().length < 2)      b.push({ k:'name',  t:'Trag deinen Namen ein.' });
    if(!EMAIL_RE.test(S.email.trim())) b.push({ k:'email', t:'Trag deine E-Mail-Adresse ein.' });
    if(!/^https:\/\//i.test(emblemUrl())){
      b.push({ k:'local', t:'Vorschaumodus. Das Emblem wird von einer lokalen oder unsicheren Adresse geladen. Eine so kopierte Signatur zeigt in jedem Mailprogramm ein kaputtes Bild. Zum Kopieren muss emblemBase eine https-Adresse sein.' });
    }
    if(S.imgState === 'checking')      b.push({ k:'img',   t:'Das Bild wird gerade geprüft.' });
    if(S.imgState === 'fail')          b.push({ k:'img',   t:'Das Emblem ist unter der hinterlegten Adresse nicht erreichbar. Ohne Bild wird die Signatur nicht kopiert.' });
    return b;
  }
  function canCopy(){ return blockers().length === 0; }

  /* Bildpruefung. Ohne bestandene Pruefung wird nie kopiert
     und nie Erfolg gemeldet. */
  var checkToken = 0;
  function checkImage(){
    var url = emblemUrl(), token = ++checkToken;
    S.imgState = 'checking';
    paint();
    var im = new Image();
    im.onload  = function(){ if(token === checkToken){ S.imgState = 'ok';   paint(); } };
    im.onerror = function(){ if(token === checkToken){ S.imgState = 'fail'; paint(); } };
    im.src = url;
  }

  /* =================================================================
     Signatur-HTML
     ================================================================= */

  function legalLines(){
    var out = [
      esc(KANZLEI.firma) + ', ' + esc(KANZLEI.adresse),
      esc(KANZLEI.register),
      esc(KANZLEI.fuehrung)
    ];
    if(KANZLEI.zeigeKammer) out.push(esc(KANZLEI.kammer));
    if(KANZLEI.zeigeDatenschutz && safeUrl(KANZLEI.datenschutzUrl)){
      out.push('<a href="' + esc(KANZLEI.datenschutzUrl) + '" style="color:inherit;text-decoration:underline">' + esc(KANZLEI.datenschutzText) + '</a>');
    }
    return out;
  }
  function legalPlain(){
    var out = [
      KANZLEI.firma + ', ' + KANZLEI.adresse,
      KANZLEI.register,
      KANZLEI.fuehrung
    ];
    if(KANZLEI.zeigeKammer) out.push(KANZLEI.kammer);
    if(KANZLEI.zeigeDatenschutz && safeUrl(KANZLEI.datenschutzUrl)) out.push(KANZLEI.datenschutzText + ': ' + KANZLEI.datenschutzUrl);
    return out;
  }

  function frame(w, h){
    return '<img src="' + esc(emblemUrl()) + '" width="' + w + '" height="' + h + '" alt="b&rsquo;steuern"' +
           ' style="display:block;width:' + w + 'px;height:' + h + 'px;border:0;background:#FFFFFF">';
  }
  function hr(width, color){
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="' + width +
           '" style="width:' + width + 'px;border-collapse:collapse"><tr><td height="1"' +
           ' style="height:1px;background:' + color + ';font-size:0;line-height:0">&nbsp;</td></tr></table>';
  }

  function fullHtml(){
    var ink = '#0E0C1C', mid = '#565560', line = '#E9E9EB';
    var tel = 'tel:' + String(S.phone||'').replace(/[^+0-9]/g,'');
    var cta = safeUrl(S.ctaUrl);
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="512" style="width:512px;border-collapse:collapse;font-family:' + FONT + '">' +
      '<tr><td valign="top" width="110" style="width:110px">' + frame(110,134) + '</td>' +
      '<td valign="top" width="402" style="width:402px;padding:3px 0 0 26px">' +
      '<div style="font-size:19px;font-weight:600;letter-spacing:-.015em;line-height:1.25;color:' + ink + ';padding-bottom:' + (S.showRole ? '5px' : '14px') + '">' + esc(S.name) + '</div>' +
      (S.showRole && S.role ? '<div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:' + ink + ';padding-bottom:14px">' + esc(S.role) + '</div>' : '') +
      '<div style="font-size:13px;line-height:1.7">' +
      (S.showPhone && S.phone ? '<a href="' + esc(tel) + '" style="color:' + ink + ';font-weight:500;text-decoration:none">' + esc(S.phone) + '</a><br>' : '') +
      '<a href="mailto:' + esc(S.email) + '" style="color:' + ink + ';font-weight:500;text-decoration:underline">' + esc(S.email) + '</a><br>' +
      '<a href="' + esc(KANZLEI.websiteUrl) + '" style="color:' + ink + ';font-weight:500;text-decoration:underline">' + esc(KANZLEI.website) + '</a><br>' +
      '<span style="color:' + mid + '">' + esc(KANZLEI.webTail) + '</span>' +
      '</div>' +
      (S.showCta && cta && S.ctaText
        ? '<div style="padding:14px 0 0">' + hr(376, line) + '</div>' +
          '<div style="padding:12px 0 0"><a href="' + esc(cta) + '" style="font-size:13px;font-weight:500;color:' + ink + ';text-decoration:underline">' + esc(S.ctaText) + ' &rarr;</a></div>'
        : '') +
      '</td></tr>' +
      '<tr><td colspan="2" style="padding-top:18px">' + hr(512, line) +
      '<div style="padding-top:12px;font-size:11px;line-height:1.65;color:' + mid + '">' + legalLines().join('<br>') + '</div>' +
      '</td></tr></table>';
  }

  function shortHtml(){
    var ink = '#0E0C1C', mid = '#565560', line = '#E9E9EB';
    var tel = 'tel:' + String(S.phone||'').replace(/[^+0-9]/g,'');
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="500" style="width:500px;border-collapse:collapse;font-family:' + FONT + '">' +
      '<tr><td valign="top" width="74" style="width:74px">' + frame(74,90) + '</td>' +
      '<td valign="top" style="padding-left:16px">' +
      '<div style="font-size:14px;line-height:1.7;color:' + ink + '"><span style="font-weight:600">' + esc(S.name) + '</span>' +
      (S.showRole && S.role ? '<span style="color:' + mid + '">, ' + esc(S.role) + '</span>' : '') + '</div>' +
      '<div style="font-size:13px;line-height:1.7">' +
      (S.showPhone && S.phone ? '<a href="' + esc(tel) + '" style="color:' + ink + ';text-decoration:none">' + esc(S.phone) + '</a><span style="color:' + mid + '"> · </span>' : '') +
      '<a href="mailto:' + esc(S.email) + '" style="color:' + ink + ';text-decoration:underline">' + esc(S.email) + '</a><span style="color:' + mid + '"> · </span>' +
      '<a href="' + esc(KANZLEI.websiteUrl) + '" style="color:' + ink + ';text-decoration:underline">' + esc(KANZLEI.website) + '</a>' +
      '</div>' +
      '<div style="padding-top:10px">' + hr(390, line) + '</div>' +
      '<div style="padding-top:8px;font-size:11px;line-height:1.6;color:' + mid + '">' + legalLines().join('<br>') + '</div>' +
      '</td></tr></table>';
  }

  function sigHtml(){ return S.variant === 'short' ? shortHtml() : fullHtml(); }

  function plainText(){
    var l = [S.name];
    if(S.showRole && S.role) l.push(S.role);
    if(S.showPhone && S.phone) l.push(S.phone);
    l.push(S.email);
    if(S.variant === 'full'){
      l.push(KANZLEI.website + ' - ' + KANZLEI.webTail);
      if(S.showCta && S.ctaText && safeUrl(S.ctaUrl)) l.push(S.ctaText + ': ' + S.ctaUrl);
    } else {
      l.push(KANZLEI.website);
    }
    return l.concat(['']).concat(legalPlain()).join('\n');
  }

  function fileHtml(){
    return '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<title>Signatur ' +
      esc(S.name) + '</title>\n</head>\n<body style="margin:0;padding:32px;background:#ffffff">\n' +
      sigHtml() + '\n</body>\n</html>\n';
  }

  /* =================================================================
     Aktionen
     ================================================================= */

  var statusTimer = null;
  function say(msg, bad){
    var n = document.getElementById('sg-status');
    if(!n) return;
    n.textContent = msg;
    n.style.color = bad ? '#FF0670' : '#3D2BD5';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function(){ n.textContent = ''; }, 6000);
  }

  function legacyCopy(html){
    var host = el('div');
    host.setAttribute('contenteditable','true');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:normal';
    host.innerHTML = html;
    document.body.appendChild(host);
    var range = document.createRange();
    range.selectNodeContents(host);
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    var ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
    sel.removeAllRanges();
    document.body.removeChild(host);
    return ok;
  }

  async function copyRich(){
    if(!canCopy()){ say('Noch nicht so weit. Die offenen Punkte stehen oben.', true); return; }
    var html = sigHtml(), ok = false;
    try{
      await navigator.clipboard.write([ new ClipboardItem({
        'text/html':  new Blob([html],        { type:'text/html'  }),
        'text/plain': new Blob([plainText()], { type:'text/plain' })
      })]);
      ok = true;
    }catch(e){
      ok = legacyCopy(html);
    }
    /* Erfolg wird nur gemeldet, wenn wirklich kopiert wurde. */
    if(ok) say('Signatur kopiert, samt Bild. Jetzt im Mailprogramm ins Signaturfeld einfügen.');
    else   say('Der Browser hat das Kopieren blockiert. Nimm „HTML-Code kopieren“ oder lade die Datei herunter.', true);
  }

  async function copyCode(){
    if(!canCopy()){ say('Noch nicht so weit. Die offenen Punkte stehen oben.', true); return; }
    try{
      await navigator.clipboard.writeText(sigHtml());
      say('HTML-Code kopiert.');
    }catch(e){
      say('Der Browser hat das Kopieren blockiert. Lade die Datei herunter.', true);
    }
  }

  function saveBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = el('a', { href:url, download:filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
  function slug(){
    return (String(S.name||'signatur').toLowerCase()
      .replace(/[äÄ]/g,'ae').replace(/[öÖ]/g,'oe').replace(/[üÜ]/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')) || 'bsteuern';
  }
  function downloadFile(){
    if(!canCopy()){ say('Noch nicht so weit. Die offenen Punkte stehen oben.', true); return; }
    saveBlob(new Blob([fileHtml()], { type:'text/html;charset=utf-8' }), 'signatur-' + slug() + '-' + S.variant + '.html');
    say('Datei geladen. Im Browser öffnen, alles markieren, ins Signaturfeld ziehen.');
  }
  async function downloadPng(){
    var url = emblemUrl();
    try{
      var r = await fetch(url, { mode:'cors' });
      if(!r.ok) throw new Error(String(r.status));
      saveBlob(await r.blob(), emblemFile(emblemIndex(), S.colorIndex));
      say('PNG geladen: 220 × 268 px.');
    }catch(e){
      window.open(url, '_blank', 'noopener');
      say('Direkter Download nicht möglich. Das Bild ist in einem neuen Tab geöffnet, dort mit Rechtsklick speichern.', true);
    }
  }

  /* =================================================================
     Oberflaeche
     ================================================================= */

  var root, mountedOnce = false;

  function set(patch, recheck){
    for(var k in patch) S[k] = patch[k];
    if(recheck) checkImage(); else paint();
  }

  function field(label, key, opts){
    opts = opts || {};
    var inp = el('input', {
      type:'text', value:S[key], placeholder:opts.ph || '', 'data-k':key,
      class: opts.bad ? 'is-bad' : '',
      oninput:function(e){ S[key] = e.target.value; scheduleName(key); }
    });
    return el('label', { class:'sg-field' }, [ label ? el('span', { text:label }) : null, inp ]);
  }

  /* Namensaenderung aendert das Emblem, deshalb entprellte Neupruefung. */
  var nameTimer = null;
  function scheduleName(key){
    paintLight();
    if(key === 'name' && S.emblemPick === null){
      clearTimeout(nameTimer);
      nameTimer = setTimeout(checkImage, 400);
    }
  }

  function check(label, key){
    var on = S[key];
    return el('div', { class:'sg-check', role:'checkbox', tabindex:'0', 'aria-checked':on ? 'true' : 'false',
      onclick:function(){ set(kv(key, !on)); },
      onkeydown:function(e){ if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); set(kv(key, !on)); } }
    }, [ el('span', { class:'sg-box', text: on ? '✓' : '' }), el('span', { text:label }) ]);
  }
  function kv(k, v){ var o = {}; o[k] = v; return o; }

  function gateBox(){
    var b = blockers();
    if(!b.length){
      return el('div', { class:'sg-gate is-ok' }, [
        el('div', { text:'Alles bereit. Das Emblem ist erreichbar, deine Angaben sind vollständig.' })
      ]);
    }
    var kids = [ el('div', { text:'Kopieren ist noch gesperrt:' }),
      el('ul', {}, b.map(function(x){ return el('li', { text:x.t }); })) ];
    if(b.some(function(x){ return x.k === 'img'; }) && S.imgState === 'fail'){
      kids.push(el('div', {}, [ el('code', { text:emblemUrl() }) ]));
    }
    return el('div', { class:'sg-gate is-bad' }, kids);
  }

  function steps(){
    var cl = S.client, st = S.stage;
    var sigName = st === 1 ? 'Neue Mails' : 'Antworten';
    var last = st === 1
      ? 'Zurück hierher und auf „Eingefügt, weiter zu Schritt 2“ drücken.'
      : (cl === 'gmail'
        ? 'In Gmail bei „Standardeinstellungen für Signatur“ links „Neue Mails“ und rechts „Antworten“ auswählen.'
        : cl === 'outlook'
        ? 'In Outlook unter „Standardsignaturen auswählen“ die eine für neue Mails, die andere für Antworten setzen.'
        : 'In Mail bei jedem Konto die passende Signatur auswählen.');
    var list = cl === 'apple'
      ? ['Unten auf „Datei ' + st + ' laden“ drücken.',
         'Die geladene Datei im Browser öffnen und alles markieren.',
         'Mail öffnen: Einstellungen, Signaturen, neue Signatur anlegen, „' + sigName + '“ nennen und die Auswahl hineinziehen.',
         last]
      : ['Unten auf „Fassung ' + st + ' kopieren“ drücken.',
         cl === 'gmail'
           ? 'Gmail öffnen: Einstellungen, „Alle Einstellungen ansehen“, unter „Allgemein“ zu „Signatur“ scrollen, neue Signatur anlegen und „' + sigName + '“ nennen.'
           : 'Outlook öffnen: Einstellungen, E-Mail, Signaturen, neue Signatur anlegen und „' + sigName + '“ nennen.',
         'In das Signaturfeld klicken, einfügen und speichern.',
         last];
    return list;
  }

  function paintLight(){
    /* Nur die Teile, die sich beim Tippen aendern. Der Fokus im
       Eingabefeld darf dabei nicht verloren gehen. */
    var p = document.getElementById('sg-preview');
    if(p) p.innerHTML = sigHtml();
    var g = document.getElementById('sg-gatebox');
    if(g) g.replaceChildren(gateBox());
    var btn = document.getElementById('sg-primary');
    if(btn) btn.disabled = !canCopy();
    document.querySelectorAll('#sig-app [data-needs-copy]').forEach(function(b){ b.disabled = !canCopy(); });
  }

  function paint(){
    if(!root) return;
    var focusKey = document.activeElement && document.activeElement.closest &&
      document.activeElement.closest('#sig-app') ? document.activeElement.getAttribute('data-k') : null;

    var emailBad = S.email.length > 0 && !EMAIL_RE.test(S.email.trim());
    var domainWarn = EMAIL_RE.test(S.email.trim()) && S.email.trim().toLowerCase().indexOf('@' + KANZLEI.mailDomain) === -1;

    /* ---- linke Spalte ---- */
    var person = el('div', { class:'sg-block' }, [
      el('div', { class:'sg-rowline' }, [ el('span', { class:'sg-tag', text:'Person' }) ]),
      field('Name', 'name', { ph:'Vorname Nachname' }),
      field('E-Mail', 'email', { ph:'vorname@' + KANZLEI.mailDomain, bad:emailBad }),
      domainWarn ? el('div', { class:'sg-note', text:'Hinweis: das ist keine ' + KANZLEI.mailDomain + '-Adresse. Gewollt?' }) : null
    ]);

    var optional = el('div', { class:'sg-block' }, [
      el('div', { class:'sg-rowline' }, [
        el('span', { class:'sg-tag', text:'Optional' }),
        el('span', { class:'sg-note', text:'Haken weg, Zeile weg.' })
      ]),
      el('div', { class:'sg-sub' }, [
        check('Titel / Funktion', 'showRole'),
        S.showRole ? field('', 'role', { ph:'z. B. Steuerfachangestellte' }) : null
      ]),
      el('div', { class:'sg-sub' }, [
        check('Telefon', 'showPhone'),
        S.showPhone ? field('', 'phone', { ph:'+49 30 ...' }) : null
      ]),
      el('div', { class:'sg-sub' }, [
        check('Termin-Zeile', 'showCta'),
        S.showCta ? field('Termin-Text', 'ctaText') : null,
        S.showCta ? field('Termin-Link', 'ctaUrl') : null
      ])
    ]);

    var colors = el('div', { class:'sg-block' }, [
      el('div', {}, [ el('span', { class:'sg-tag', text:'Farbe' }) ]),
      el('div', { class:'sg-btns' }, PALETTE.map(function(p, i){
        return el('button', { type:'button', class:'sg-btn is-sm' + (i === S.colorIndex ? ' is-on' : ''),
          onclick:function(){ set({ colorIndex:i }, true); } }, [
          el('span', { class:'sg-swatch', style:'background:' + p.hex }),
          el('span', { text:p.label })
        ]);
      }))
    ]);

    var emblemKids = [
      el('div', { class:'sg-rowline sg-between' }, [
        el('span', { class:'sg-tag', text:'Emblem' }),
        el('button', { type:'button', class:'sg-btn is-ghost is-sm',
          text: S.emblemsOpen ? 'Auswahl schließen' : 'anderes Emblem wählen',
          onclick:function(){ set({ emblemsOpen:!S.emblemsOpen }); } })
      ]),
      el('div', { class:'sg-note', text:'Wird automatisch aus deinem Namen berechnet. Du musst hier nichts tun.' })
    ];
    if(S.emblemsOpen){
      var picks = [];
      for(var k=0;k<PATTERN_COUNT;k++){
        (function(idx){
          picks.push(el('button', { type:'button', 'aria-pressed': idx === emblemIndex() ? 'true' : 'false',
            title:'Emblem ' + (idx+1), onclick:function(){ set({ emblemPick:idx }, true); } }, [
            el('img', { src:EMBLEM_BASE + emblemFile(idx, S.colorIndex), alt:'', loading:'lazy' })
          ]));
        })(k);
      }
      emblemKids.push(el('div', { class:'sg-emblems' }, picks));
      if(S.emblemPick !== null){
        emblemKids.push(el('button', { type:'button', class:'sg-btn is-ghost is-sm',
          text:'zurück zur automatischen Auswahl', onclick:function(){ set({ emblemPick:null }, true); } }));
      }
    }
    var emblem = FIXED_MODE ? null : el('div', { class:'sg-block' }, emblemKids);

    var fixedRows = [
      ['Zusatz hinter der Website', KANZLEI.webTail],
      ['Logo und Format', 'Sind gesetzt, du musst nichts einstellen.'],
      ['Kanzleiangaben', legalPlain().join('\n')]
    ];
    var fixed = el('div', { class:'sg-block' }, [
      el('div', { class:'sg-rowline' }, [
        el('span', { class:'sg-tag', text:'Fest' }),
        el('span', { class:'sg-note', text:'Für alle gleich.' })
      ]),
      el('div', { class:'sg-fixed' }, fixedRows.map(function(r){
        return el('div', {}, [
          el('div', { class:'sg-lbl', text:r[0] }),
          el('p', { text:r[1] })
        ]);
      }))
    ]);

    var leftCard = el('div', { class:'sg-card' }, [ person, optional, colors, emblem, fixed ]);

    /* ---- rechte Spalte ---- */
    var previewCard = el('div', { class:'sg-card' }, [
      el('div', { class:'sg-lbl', text:'So sieht sie aus' }),
      el('div', { class:'sg-btns' }, [
        ['full','Für neue Mails'], ['short','Für Antworten']
      ].map(function(v){
        return el('button', { type:'button', class:'sg-btn is-sm' + (S.variant === v[0] ? ' is-on' : ''),
          text:v[1], onclick:function(){ set({ variant:v[0] }); } });
      })),
      el('div', { class:'sg-preview', id:'sg-preview', html:sigHtml() })
    ]);

    var gate = el('div', { id:'sg-gatebox' }, [ gateBox() ]);

    var wizard = el('div', { class:'sg-card' }, [
      el('div', { class:'sg-btns' }, [
        ['gmail','Gmail'], ['outlook','Outlook'], ['apple','Apple Mail']
      ].map(function(c){
        return el('button', { type:'button', class:'sg-btn is-sm' + (S.client === c[0] ? ' is-on' : ''),
          text:c[1], onclick:function(){ set({ client:c[0], finished:false }); } });
      })),
      el('div', { class:'sg-rowline' }, [
        el('span', { class:'sg-tag is-ind', text:'Schritt ' + S.stage + ' von 2' }),
        el('span', { class:'sg-h2',
          text: S.stage === 1 ? 'Signatur für neue Mails' : 'Signatur für Antworten' })
      ]),
      el('div', { class:'sg-steps' }, steps().map(function(t, i){
        return el('div', { class:'sg-step' }, [ el('span', { text:String(i+1) }), el('span', { text:t }) ]);
      })),
      el('div', { class:'sg-btns' }, [
        el('button', { type:'button', id:'sg-primary', class:'sg-btn is-lg is-on', disabled:!canCopy(),
          text: S.client === 'apple' ? ('Datei ' + S.stage + ' laden') : ('Fassung ' + S.stage + ' kopieren'),
          onclick:function(){
            S.variant = S.stage === 1 ? 'full' : 'short';
            paintLight();
            if(S.client === 'apple') downloadFile(); else copyRich();
          }}),
        el('button', { type:'button', class:'sg-btn',
          text: S.stage === 1 ? 'Eingefügt, weiter zu Schritt 2' : 'Fertig',
          onclick:function(){
            if(S.stage === 1) set({ stage:2, variant:'short' });
            else set({ finished:true });
          }})
      ]),
      el('div', { class:'sg-status', id:'sg-status' }),
      S.finished ? el('div', { class:'sg-done', text:'Fertig. Letzter Schritt, und der ist der wichtigste: schick dir selbst eine Mail und prüf, ob die weiße Kachel mit dem Muster ankommt. Wenn nicht, sag Bescheid, statt es so zu lassen.' }) : null,
      el('div', { class:'sg-block' }, [
        el('div', { class:'sg-lbl', text:'Falls etwas klemmt' }),
        el('div', { class:'sg-btns' }, [
          el('button', { type:'button', class:'sg-btn is-sm', 'data-needs-copy':'1', disabled:!canCopy(),
            text:'HTML-Code kopieren', onclick:copyCode }),
          el('button', { type:'button', class:'sg-btn is-sm', 'data-needs-copy':'1', disabled:!canCopy(),
            text:'HTML-Datei herunterladen', onclick:downloadFile }),
          el('button', { type:'button', class:'sg-btn is-sm', text:'Emblem als PNG', onclick:downloadPng })
        ])
      ])
    ]);

    var rightCol = el('div', { class:'sg-col' }, [ gate, previewCard, wizard ]);
    var leftCol  = el('div', { class:'sg-col' }, [ leftCard ]);

    var head = el('div', { class:'sg-head' }, [
      el('div', {}, [ el('span', { class:'sg-tag is-ind', text:'b’steuern · intern' }) ]),
      el('h1', { class:'sg-h1', text:'Signatur-Generator' }),
      el('p', { class:'sg-lead', text:'Name und E-Mail eintragen, unten kopieren, im Mailprogramm einfügen. Dauert zwei Minuten. Dein Emblem entsteht automatisch aus deinem Namen. Alles andere ist gesetzt.' })
    ]);

    root.replaceChildren(el('div', { class:'sg-wrap' }, [ head, el('div', { class:'sg-cols' }, [ leftCol, rightCol ]) ]));

    /* Fokus zuruecksetzen, damit Tippen nicht abreisst */
    if(focusKey){
      var back = root.querySelector('[data-k="' + focusKey + '"]');
      if(back){ back.focus(); back.setSelectionRange(back.value.length, back.value.length); }
    }
  }

  function boot(){
    root = document.getElementById('sig-app');
    if(!root || mountedOnce) return;
    mountedOnce = true;
    checkImage();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

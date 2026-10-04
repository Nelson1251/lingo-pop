(function () {
  "use strict";

  var KEYS = {
    progress: "lingo-pop-progress",
    points: "lingo-pop-points",
    awarded: "lingo-pop-awarded",
    trial: "lingo-pop-trial-started-at",
    sub: "lingo-pop-demo-subscription",
    energy: "lingo-pop-energy",
    energyUpdated: "lingo-pop-energy-updated",
    streak: "lingo-pop-streak",
    openPhrase: "lingo-pop-open-phrase"
  };
  var TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
  var HOUR_MS = 60 * 60 * 1000;
  var ENERGY_MAX = 25;
  var LEVELS = {
    basico: { label: "Básico", blurb: "Frases cortas. Siempre gratis." },
    intermedio: { label: "Intermedio", blurb: "Frases un poco más largas." },
    avanzado: { label: "Avanzado", blurb: "Frases más largas." }
  };
  var CATS = {
    all: "Todas",
    greetings: "Saludos",
    travel: "Viaje",
    work: "Trabajo",
    shopping: "Compras",
    food: "Comida"
  };
  var EMPTY_MSG = "Sin energía. Recuperas aproximadamente 1 por hora. Puedes repetir esta frase, pero no pasar a otra. Básico sigue abierto.";

  var state = {
    clips: [],
    screen: "home",
    level: null,
    index: 0,
    category: "all",
    direction: "en-es",
    checkout: false,
    status: "",
    homeNote: "",
    recorder: null,
    chunks: [],
    takeUrl: "",
    recording: false,
    visitClip: null,
    visitPaid: false,
    playWithVideo: false,
    blankTries: {},
    blankSolved: {},
    blankMsg: {},
    order: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function points() {
    var n = Number(localStorage.getItem(KEYS.points));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function progressAll() {
    return loadJSON(KEYS.progress, {});
  }

  function row(id) {
    return progressAll()[id] || { heard: false, repeated: false, dominada: false };
  }

  function saveRow(id, next) {
    var all = progressAll();
    all[id] = next;
    localStorage.setItem(KEYS.progress, JSON.stringify(all));
  }

  function awardFirst(id) {
    var awarded = loadJSON(KEYS.awarded, []);
    if (awarded.indexOf(id) !== -1) return false;
    awarded.push(id);
    localStorage.setItem(KEYS.awarded, JSON.stringify(awarded));
    localStorage.setItem(KEYS.points, String(points() + 10));
    return true;
  }

  function remainingDays(iso, now) {
    var start = Date.parse(iso);
    if (!Number.isFinite(start)) return 0;
    var remain = start + TRIAL_MS - now;
    if (remain <= 0) return 0;
    return Math.ceil(remain / (24 * 60 * 60 * 1000));
  }

  function trialLabel(days) {
    if (days === 1) return "Prueba gratis: 1 día restante";
    return "Prueba gratis: " + days + " días restantes";
  }

  function isSubscribed() {
    return localStorage.getItem(KEYS.sub) === "1";
  }

  function setSubscribed(on) {
    if (on) localStorage.setItem(KEYS.sub, "1");
    else localStorage.removeItem(KEYS.sub);
  }

  function startTrialIfNeeded() {
    var existing = localStorage.getItem(KEYS.trial);
    if (existing) return existing;
    var now = new Date().toISOString();
    localStorage.setItem(KEYS.trial, now);
    return now;
  }

  function trialDaysStarted() {
    var iso = localStorage.getItem(KEYS.trial);
    if (!iso) return 0;
    return remainingDays(iso, Date.now());
  }

  function premiumState(startIfMissing) {
    if (isSubscribed()) return { mode: "sub", days: trialDaysStarted() };
    var existing = localStorage.getItem(KEYS.trial);
    var iso = existing;
    if (!iso && startIfMissing) iso = startTrialIfNeeded();
    if (!iso) return { mode: "not-started", days: 0 };
    var days = remainingDays(iso, Date.now());
    if (days > 0) return { mode: "trial", days: days };
    return { mode: "expired", days: 0 };
  }

  function energyNow() {
    var rawE = localStorage.getItem(KEYS.energy);
    var rawT = localStorage.getItem(KEYS.energyUpdated);
    var energy = rawE == null ? ENERGY_MAX : Number(rawE);
    var last = rawT == null ? Date.now() : Number(rawT);
    if (!Number.isFinite(energy)) energy = ENERGY_MAX;
    if (!Number.isFinite(last)) last = Date.now();
    energy = Math.max(0, Math.min(ENERGY_MAX, Math.floor(energy)));
    var now = Date.now();
    if (now > last) {
      var hours = Math.floor((now - last) / HOUR_MS);
      if (hours > 0) {
        energy = Math.min(ENERGY_MAX, energy + hours);
        last = last + hours * HOUR_MS;
      }
    }
    localStorage.setItem(KEYS.energy, String(energy));
    localStorage.setItem(KEYS.energyUpdated, String(last));
    return energy;
  }

  function setEnergy(n) {
    var v = Math.max(0, Math.min(ENERGY_MAX, n));
    localStorage.setItem(KEYS.energy, String(v));
    return v;
  }

  function usesEnergy() {
    return !!state.level && state.level !== "basico" && !isSubscribed();
  }

  function spendEnergy(n) {
    if (!usesEnergy()) return true;
    var e = energyNow();
    if (e < n) return false;
    setEnergy(e - n);
    return true;
  }

  function bonusEnergy(n) {
    if (!usesEnergy()) return;
    setEnergy(energyNow() + n);
  }

  function streak() {
    var n = Number(localStorage.getItem(KEYS.streak));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function setStreak(n) {
    localStorage.setItem(KEYS.streak, String(Math.max(0, n)));
  }

  // Sidebar order is the order each line is spoken in its VOA lesson,
  // and lessons run in series order. Not the old id order.
  var CLIP_SEQ = [
    "l02", "l01", "l24", "l23", "l16", "l06", "l12", "l10", "l15", "l08",
    "l17", "l03", "l04", "l18", "l07", "l13", "l11",
    "l21", "l05", "l22", "l19", "l20", "l14", "l09"
  ];
  function clipSeq(id) {
    var i = CLIP_SEQ.indexOf(id);
    return i < 0 ? 999 : i;
  }

  function levelClips() {
    return state.clips.filter(function (c) {
      if (!isCorePhrase(c)) return false;
      if (c.level !== state.level) return false;
      if (state.category !== "all" && c.category !== state.category) return false;
      return true;
    }).sort(function (a, b) { return clipSeq(a.id) - clipSeq(b.id); });
  }

  function levelAll() {
    return state.clips.filter(function (c) { return isCorePhrase(c) && c.level === state.level; });
  }

  function dominadasInLevel() {
    return levelAll().filter(function (c) { return row(c.id).dominada; }).length;
  }

  function renderPoints(extra) {
    var el = $("points");
    if (!el) return;
    el.textContent = "Puntos: " + points() + (extra || "");
    if (extra) {
      el.classList.add("flash");
      setTimeout(function () { el.classList.remove("flash"); }, 1200);
    }
  }

  function stopAudio() {
    $("voa").pause();
  }

  function startWithVideoIfNeeded() {
    if (!state.playWithVideo) return;
    state.playWithVideo = false;
    if (state.screen !== "practice") return;
    var clip = currentClip();
    if (!clip) return;
    if (document.getElementById("clip-video")) playClipVideo({ restart: true });
    else if (clip.audio) playVoa(clip, true);
  }

  function playClipVideo(opts) {
    opts = opts || {};
    var vid = document.getElementById("clip-video");
    if (!vid) return false;
    stopAudio();
    vid.muted = false;
    vid.volume = 1;
    vid.loop = false;
    if (opts.restart) vid.currentTime = 0;
    var pending = vid.play();
    if (pending && pending.then) {
      pending.then(function () {
        var clip = currentClip();
        if (clip) markHeard(clip.id);
        setStatus("Video de la lección completa con audio.");
      }).catch(function () {
        setStatus("Toca el botón de reproducir para oír el video.");
      });
    }
    return true;
  }

  function setStatus(text) {
    state.status = text || "";
    var el = document.getElementById("status");
    if (el) el.textContent = state.status;
  }

  function markHeard(id) {
    var r = row(id);
    r.heard = true;
    saveRow(id, r);
  }

  function beginVisit(id) {
    if (state.visitClip !== id) {
      state.visitClip = id;
      state.visitPaid = false;
    }
  }

  function playVoa(clip, restart) {
    if (document.getElementById("clip-video")) {
      playClipVideo({ restart: !!restart });
      return;
    }
    if (!clip.audio) {
      setStatus("No hay archivo de audio de VOA en este clip. Usa «Escuchar con voz del navegador». Esa voz no es de VOA.");
      return;
    }
    var audio = $("voa");
    if (restart || !audio.src || audio.src.indexOf(clip.audio) === -1) audio.src = clip.audio;
    if (clip.startSeconds != null) audio.currentTime = clip.startSeconds;
    else if (restart) audio.currentTime = 0;
    audio.play().then(function () {
      markHeard(clip.id);
      setStatus("Audio de la lección completa. No es un recorte de 5–15 segundos.");
    }).catch(function () {
      setStatus("No se pudo reproducir el audio de VOA. Usa la voz del navegador. Esa voz no es de VOA.");
    });
  }

  function speakBrowser(clip) {
    if (!window.speechSynthesis) {
      setStatus("La voz del navegador no está disponible en este dispositivo.");
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(clip.en);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
    markHeard(clip.id);
    setStatus("Voz del navegador, no es el audio de VOA.");
  }

  function repetir(clip) {
    if (document.getElementById("clip-video")) {
      playClipVideo({ restart: true });
      return;
    }
    if (clip.audio) playVoa(clip, true);
    else speakBrowser(clip);
  }

  function resumeMedia(clip) {
    if (document.getElementById("clip-video")) {
      playClipVideo({ restart: false });
      return;
    }
    var audio = $("voa");
    if (!clip.audio) return;
    var same = !!(audio.src && audio.src.indexOf(clip.audio) !== -1);
    if (same && audio.currentTime > 0.05) {
      audio.play().then(function () {
        markHeard(clip.id);
      }).catch(function () {
        setStatus("No se pudo reproducir el audio de VOA. Usa la voz del navegador. Esa voz no es de VOA.");
      });
      return;
    }
    playVoa(clip, true);
  }

  function pauseMedia() {
    var audio = $("voa");
    if (audio) audio.pause();
    var vid = document.getElementById("clip-video");
    if (vid) vid.pause();
  }

  function normAnswer(s) {
    return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function sentenceTokens(en) {
    return String(en || "").trim().split(/\s+/).filter(function (w) { return w; });
  }

  function blankedSentence(en, word) {
    var safe = String(word || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("\\b" + safe + "\\b");
    if (!re.test(en)) re = new RegExp("\\b" + safe + "\\b", "i");
    return String(en).replace(re, "______");
  }

  function shuffleTokens(tokens) {
    var pool = tokens.map(function (w, i) { return { w: w, k: i }; });
    var i, j, tmp;
    for (i = pool.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    if (pool.length > 1 && pool.every(function (item, idx) { return item.k === idx; })) {
      pool.push(pool.shift());
    }
    return pool;
  }

  function ensureOrder(clip) {
    if (!state.order || state.order.id !== clip.id) {
      state.order = {
        id: clip.id,
        pool: shuffleTokens(sentenceTokens(clip.en)),
        built: [],
        revealed: false,
        msg: ""
      };
    }
  }

  function wordButtons(list, side) {
    return list.map(function (item) {
      return "<button type=\"button\" class=\"chip\" data-order=\"" + side + "\" data-key=\"" + item.k + "\">" + esc(item.w) + "</button>";
    }).join("");
  }

  function paintOrder() {
    var o = state.order;
    if (!o) return;
    var built = document.getElementById("order-built");
    var pool = document.getElementById("order-pool");
    var msg = document.getElementById("order-msg");
    var answer = document.getElementById("order-answer");
    if (built) built.innerHTML = wordButtons(o.built, "built");
    if (pool) pool.innerHTML = wordButtons(o.pool, "pool");
    if (msg) msg.textContent = o.msg || "";
    if (answer) {
      answer.hidden = !o.revealed;
      if (o.revealed) {
        var clip = currentClip();
        answer.textContent = clip ? clip.en : "";
      }
    }
  }

  function resetOrder(clip) {
    state.order = {
      id: clip.id,
      pool: shuffleTokens(sentenceTokens(clip.en)),
      built: [],
      revealed: state.order && state.order.id === clip.id ? state.order.revealed : false,
      msg: ""
    };
    paintOrder();
  }

  function checkOrder(clip) {
    var o = state.order;
    if (!o || o.id !== clip.id) return;
    var guess = o.built.map(function (item) { return item.w; }).join(" ");
    var target = sentenceTokens(clip.en).join(" ");
    if (o.pool.length === 0 && guess === target) o.msg = "Correcto. Ese es el orden de la frase.";
    else o.msg = "Ese no es el orden. Inténtalo de nuevo.";
    paintOrder();
  }

  function revealOrder(clip) {
    ensureOrder(clip);
    state.order.revealed = true;
    paintOrder();
  }

  function moveOrderWord(side, key) {
    var o = state.order;
    if (!o) return;
    var from = side === "pool" ? o.pool : o.built;
    var to = side === "pool" ? o.built : o.pool;
    var idx = -1;
    for (var i = 0; i < from.length; i++) if (from[i].k === key) idx = i;
    if (idx < 0) return;
    to.push(from.splice(idx, 1)[0]);
    o.msg = "";
    paintOrder();
  }


  function isCorePhrase(clip) {
    var m = /^l0*(\d+)$/.exec(clip && clip.id || "");
    if (!m) return false;
    var n = Number(m[1]);
    return n >= 1 && n <= 24;
  }

  function glossKey(tok) {
    return String(tok || "").toLowerCase().replace(/[^a-z-]/g, "");
  }

  function tapCaption(clip) {
    return String(clip.en || "").split(/\s+/).filter(Boolean).map(function (tok) {
      return "<button type=\"button\" class=\"tap-word\" data-tok=\"" + esc(tok) + "\">" + esc(tok) + "</button>";
    }).join(" ");
  }

  function vocabCardHtml(clip) {
    var g = window.PHRASE_GLOSS && window.PHRASE_GLOSS[clip.id];
    var items = g && g.vocab || [];
    if (!items.length) return "";
    var html = "<section class=\"vocab-card\"><h2>Vocabulario de esta frase</h2><ul>";
    items.forEach(function (item) {
      html += "<li><strong>" + esc(item.en) + "</strong> — " + esc(item.es) + "</li>";
    });
    html += "</ul></section>";
    return html;
  }

  function showGloss(clip, tok) {
    var pop = document.getElementById("gloss-pop");
    if (!pop) return;
    var g = window.PHRASE_GLOSS && window.PHRASE_GLOSS[clip.id];
    var es = g && g.words && g.words[glossKey(tok)];
    pop.hidden = false;
    if (es) pop.textContent = tok.replace(/[.,!?¿¡]/g, "") + " — " + es;
    else pop.textContent = "Frase: " + clip.es;
  }

  function blankDisplay(clip) {
    var solved = state.blankSolved[clip.id];
    var tries = state.blankTries[clip.id] || 0;
    if (solved || tries >= 3) return clip.en;
    return blankedSentence(clip.en, clip.blankWord);
  }

  function checkBlank(clip) {
    var input = document.getElementById("blank-input");
    var msg = document.getElementById("blank-msg");
    var sentence = document.getElementById("blank-sentence");
    if (!input || !clip.blankWord) return;
    if (normAnswer(input.value) === normAnswer(clip.blankWord)) {
      state.blankSolved[clip.id] = true;
      state.blankMsg[clip.id] = "Correcto. Esa es la palabra.";
    } else if (!state.blankSolved[clip.id]) {
      var n = (state.blankTries[clip.id] || 0) + 1;
      if (n > 3) n = 3;
      state.blankTries[clip.id] = n;
      if (n >= 3) state.blankMsg[clip.id] = "La palabra es: " + clip.blankWord;
      else if (3 - n === 1) state.blankMsg[clip.id] = "No es esa palabra. Te queda 1 intento.";
      else state.blankMsg[clip.id] = "No es esa palabra. Te quedan " + (3 - n) + " intentos.";
    }
    if (msg) msg.textContent = state.blankMsg[clip.id] || "";
    if (sentence) sentence.textContent = blankDisplay(clip);
    var top = document.getElementById("en-line");
    if (top && !clip.spokenEn && !isCorePhrase(clip)) top.textContent = blankDisplay(clip);
  }

  function toggleRecord() {
    if (state.recording && state.recorder) {
      state.recorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("El micrófono no está disponible en este navegador.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      state.chunks = [];
      var rec;
      try { rec = new MediaRecorder(stream); }
      catch (e) {
        setStatus("No se pudo grabar en este navegador.");
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      state.recorder = rec;
      state.recording = true;
      rec.ondataavailable = function (ev) { if (ev.data.size) state.chunks.push(ev.data); };
      rec.onstop = function () {
        state.recording = false;
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (state.takeUrl) URL.revokeObjectURL(state.takeUrl);
        state.takeUrl = URL.createObjectURL(new Blob(state.chunks, { type: rec.mimeType || "audio/webm" }));
        $("take").src = state.takeUrl;
        setStatus("Listo. Pulsa «Escuchar mi toma».");
        render();
      };
      rec.start();
      setStatus("Grabando… pulsa Detener cuando termines.");
      render();
    }).catch(function () {
      setStatus("No se dio permiso al micrófono.");
    });
  }

  function energyBlocked() {
    return usesEnergy() && energyNow() <= 0;
  }

  function rememberPhrase(id) {
    if (state.level && state.level !== "basico") {
      localStorage.setItem(KEYS.openPhrase, id);
    }
  }

  function openLevel(level) {
    state.level = level;
    state.index = 0;
    state.category = "all";
    state.checkout = false;
    state.status = "";
    state.homeNote = "";
    stopAudio();
    if (level === "basico") {
      state.screen = "practice";
      state.playWithVideo = true;
      render();
      return;
    }
    var st = premiumState(true);
    if (st.mode === "expired") {
      state.screen = "gate";
      render();
      return;
    }
    if (!isSubscribed() && energyNow() <= 0) {
      var openId = localStorage.getItem(KEYS.openPhrase);
      var clips = state.clips.filter(function (c) { return c.level === level; });
      var idx = -1;
      for (var i = 0; i < clips.length; i++) if (clips[i].id === openId) idx = i;
      if (idx < 0) {
        state.screen = "home";
        state.level = null;
        state.homeNote = EMPTY_MSG;
        render();
        return;
      }
      state.index = idx;
    }
    state.screen = "practice";
    state.playWithVideo = true;
    render();
  }

  function goHome() {
    stopAudio();
    state.screen = "home";
    state.checkout = false;
    state.level = null;
    render();
  }

  function simulateSub() {
    setSubscribed(true);
    state.checkout = false;
    state.screen = "practice";
    state.playWithVideo = true;
    state.status = "Suscripción demo activa. Energía ilimitada. No se cobró nada.";
    render();
  }

  function cancelSub() {
    setSubscribed(false);
    state.status = "Suscripción demo cancelada en este sitio. Los puntos no cambian.";
    if (state.level && state.level !== "basico") {
      var st = premiumState(false);
      if (st.mode === "expired") state.screen = "gate";
    }
    render();
  }

  function toggleDominada(clip) {
    var r = row(clip.id);
    var turningOn = !r.dominada;
    r.dominada = turningOn;
    saveRow(clip.id, r);
    var extra = "";
    if (turningOn && awardFirst(clip.id)) extra = "  +10";
    render();
    if (extra) renderPoints(extra);
  }

  function markCorrect(clip) {
    var r = row(clip.id);
    if (r.repeated) {
      r.repeated = false;
      saveRow(clip.id, r);
      render();
      return;
    }
    if (usesEnergy() && !state.visitPaid) {
      if (!spendEnergy(1)) {
        state.status = EMPTY_MSG;
        render();
        return;
      }
      state.visitPaid = true;
      var s = streak() + 1;
      if (s % 5 === 0) {
        bonusEnergy(2);
        setStreak(s);
        state.status = "La dijiste bien. Racha de " + s + ". +2 de energía.";
      } else {
        setStreak(s);
        state.status = "La dijiste bien. −1 de energía.";
      }
    } else if (!state.visitPaid) {
      state.visitPaid = true;
      state.status = "Ya lo repetí.";
    }
    r.repeated = true;
    saveRow(clip.id, r);
    render();
  }

  function markWrong() {
    if (usesEnergy()) {
      if (!spendEnergy(1)) {
        state.status = EMPTY_MSG;
        render();
        return;
      }
      setStreak(0);
      state.status = "Me equivoqué. La racha vuelve a cero. −1 de energía.";
    } else {
      setStreak(0);
      state.status = "Me equivoqué. La racha vuelve a cero.";
    }
    render();
  }

  function bannerFor(level) {
    if (level === "basico") return "Siempre gratis. Sin energía.";
    if (isSubscribed()) return "Suscripción demo activa · energía ilimitada";
    var st = premiumState(false);
    if (st.mode === "trial") return trialLabel(st.days);
    if (st.mode === "expired") return "Prueba terminada";
    return "7 días de prueba la primera vez que entres";
  }

  function renderHome() {
    var html = "<h1>Elige un nivel</h1><p class=\"lead\">Mira el video, lee el inglés arriba y el español abajo, y pasa a la siguiente frase.</p>";
    if (state.homeNote) html += "<p class=\"warn\">" + esc(state.homeNote) + "</p>";
    html += "<div class=\"stack\">";
    Object.keys(LEVELS).forEach(function (key) {
      var n = state.clips.filter(function (c) { return c.level === key && isCorePhrase(c); }).length;
      html += "<button class=\"level-btn " + key + "\" data-level=\"" + key + "\"><strong>" +
        LEVELS[key].label + "</strong><span>" + n + " frases · " + esc(bannerFor(key)) + "</span></button>";
    });
    html += "</div>";
    if (!isSubscribed()) {
      var e = energyNow();
      html += "<p class=\"energy\">Energía " + e + "/" + ENERGY_MAX + " en Intermedio y Avanzado. Básico no gasta.</p>";
    }
    if (isSubscribed()) {
      html += "<p class=\"fine\">La suscripción demo está activa en este navegador. Energía ilimitada.</p>";
      html += "<button class=\"btn wide\" id=\"cancel-sub\">Cancelar suscripción en este sitio</button>";
    }
    return html;
  }

  function renderGate() {
    var label = LEVELS[state.level].label;
    var html = "<button class=\"back\" id=\"go-home\">← Niveles</button>";
    html += "<h1>" + esc(label) + "</h1>";
    html += "<p class=\"lead\">La prueba gratis de 7 días terminó. Elige un plan para seguir en este nivel. Básico sigue gratis.</p>";
    html += "<div class=\"plan featured\"><b>Anual</b><p class=\"fine\">Recomendado · $49 al año</p></div>";
    html += "<div class=\"plan\"><b>Mensual</b><p class=\"fine\">$7 al mes</p></div>";
    html += "<div class=\"stack\">";
    html += "<button class=\"btn primary wide\" id=\"pay\">Continuar al pago</button>";
    html += "<button class=\"btn lime wide\" id=\"sim\">Simular suscripción activa (sin cobro)</button>";
    html += "<button class=\"btn wide\" id=\"cancel-sub\">Cancelar suscripción en este sitio</button>";
    html += "<button class=\"btn wide\" id=\"to-basico\">Volver a Básico</button>";
    html += "</div>";
    html += "<p class=\"fine\">Si la app sale en iPhone, el pago será por la App Store. En Android, por Google Play. Esta versión web no usa esas tiendas.</p>";
    if (state.checkout) {
      html += "<div class=\"panel\"><p><strong>Modo prueba. No hay cuenta de Stripe conectada, así que no se cobra nada.</strong></p>";
      html += "<p class=\"fine\">Un pago real abriría Stripe Checkout (tarjeta y Apple Pay en navegadores compatibles en EE.UU.). La suscripción se administraría y se cancelaría en este sitio, no en Apple ni en Google.</p>";
      html += "<p class=\"fine\">Demo: no se hace ningún cobro. No pedimos número de tarjeta.</p></div>";
    }
    return html;
  }

  function energyBlockHtml() {
    if (!usesEnergy()) return "";
    var e = energyNow();
    var pct = Math.round((e / ENERGY_MAX) * 100);
    var html = "<p class=\"energy\">Energía " + e + "/" + ENERGY_MAX + "</p>";
    html += "<div class=\"bar\" aria-hidden=\"true\"><span style=\"width:" + pct + "%\"></span></div>";
    if (e <= 0) html += "<p class=\"warn\">" + esc(EMPTY_MSG) + "</p>";
    var days = trialDaysStarted();
    if (days > 0) html += "<p class=\"warn\">" + esc(trialLabel(days)) + "</p>";
    html += "<p class=\"fine\">Racha correcta: " + streak() + "</p>";
    return html;
  }

  function subEnergyHtml() {
    if (!isSubscribed() || state.level === "basico") return "";
    var html = "<p class=\"energy\">Energía ilimitada</p>";
    var days = trialDaysStarted();
    if (days > 0) html += "<p class=\"warn\">" + esc(trialLabel(days)) + "</p>";
    return html;
  }

  function renderPractice() {
    var list = levelClips();
    if (state.index >= list.length) state.index = 0;
    var totalLevel = levelAll().length;
    var done = dominadasInLevel();
    if (!list.length) {
      var empty = "<button class=\"back\" id=\"go-home\">← Niveles</button>";
      empty += "<p class=\"lead\">No hay frases en este nivel.</p>";
      return empty;
    }
    var clip = list[state.index];
    beginVisit(clip.id);
    if (state.level !== "basico") rememberPhrase(clip.id);
    var r = row(clip.id);
    var core = isCorePhrase(clip);
    var shownEs = core ? clip.es : (clip.spokenEs || clip.es);
    var transport = "<div class=\"transport\">"
      + "<button class=\"btn\" id=\"prev\" type=\"button\">Anterior</button>"
      + "<button class=\"btn\" id=\"play-resume\" type=\"button\" aria-label=\"Reproducir\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><polygon points=\"8,5 19,12 8,19\" fill=\"currentColor\"/></svg></button>"
      + "<button class=\"btn\" id=\"pause-both\" type=\"button\" aria-label=\"Pausar\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" fill=\"currentColor\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" fill=\"currentColor\"/></svg></button>"
      + "<button class=\"btn primary\" id=\"repetir\" type=\"button\">Repetir</button>"
      + "<button class=\"btn\" id=\"next\" type=\"button\">Siguiente</button>"
      + "</div>";
    var scrub = "<div class=\"scrub\" id=\"scrub\" role=\"slider\" tabindex=\"0\" aria-label=\"Avance del video\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><span id=\"scrub-fill\"></span></div>";
    var html = "<div class=\"stage\">";
    html += "<div class=\"stage-main\">";
    html += "<button class=\"back\" id=\"go-home\">← Niveles</button>";
    html += "<p class=\"episode-kicker\">" + esc(LEVELS[state.level].label) + " · " + (state.index + 1) + " de " + list.length + " · " + done + " dominadas</p>";
    if (clip.video) {
      html += "<div class=\"player\"><div class=\"clip-window\"><video class=\"clip-video\" id=\"clip-video\" src=\"" + esc(clip.video) + "\" playsinline></video>";
      html += "<div class=\"subs\">";
      html += "<p class=\"sentence\" id=\"en-line\">" + (core ? tapCaption(clip) : esc(clip.spokenEn || clip.en)) + "</p>";
      html += "<p class=\"translation\" id=\"es-line\">" + esc(shownEs) + "</p>";
      html += "</div></div>" + scrub + transport + "</div>";
    } else {
      html += "<div class=\"player\"><div class=\"subs subs-solo\">";
      html += "<p class=\"sentence\" id=\"en-line\">" + (core ? tapCaption(clip) : esc(clip.en)) + "</p>";
      html += "<p class=\"translation\" id=\"es-line\">" + esc(shownEs) + "</p>";
      html += "</div>" + transport + "</div>";
    }
    html += "<p class=\"gloss-pop\" id=\"gloss-pop\" hidden></p>";
    if (core) html += vocabCardHtml(clip);
    html += "<p class=\"fine\">Toca una palabra del inglés para ver qué significa. El video sigue siendo la lección completa de VOA.</p>";
    ensureOrder(clip);
    html += "<details class=\"more\"><summary>Practicar esta frase</summary>";
    html += "<section class=\"exercise\" id=\"order-box\">";
    html += "<h2>Ordena la frase</h2>";
    html += "<div class=\"word-row\" id=\"order-built\">" + wordButtons(state.order.built, "built") + "</div>";
    html += "<div class=\"word-row\" id=\"order-pool\">" + wordButtons(state.order.pool, "pool") + "</div>";
    html += "<div class=\"row\">";
    html += "<button class=\"btn\" id=\"order-check\" type=\"button\">Comprobar</button>";
    html += "<button class=\"btn\" id=\"order-reset\" type=\"button\">Reiniciar</button>";
    html += "<button class=\"btn\" id=\"order-reveal\" type=\"button\">Ver la frase</button>";
    html += "</div>";
    html += "<p class=\"status\" id=\"order-msg\">" + esc(state.order.msg || "") + "</p>";
    html += "<p class=\"sentence\" id=\"order-answer\"" + (state.order.revealed ? "" : " hidden") + ">" + (state.order.revealed ? esc(clip.en) : "") + "</p>";
    html += "</section>";
    html += "<div class=\"stack\">";
    html += "<button class=\"btn wide\" id=\"tts\">Escuchar con voz del navegador</button>";
    html += "<button class=\"btn wide\" id=\"rec\">" + (state.recording ? "Detener" : "Grabar") + "</button>";
    html += "<button class=\"btn wide\" id=\"play-take\"" + (state.takeUrl ? "" : " disabled") + ">Escuchar mi toma</button>";
    html += "<button class=\"btn wide" + (r.repeated ? " on" : "") + "\" id=\"correct\">" + (r.repeated ? "Ya lo repetí" : "La dije bien") + "</button>";
    html += "<button class=\"btn wide\" id=\"wrong\">Me equivoqué</button>";
    html += "<button class=\"btn lime wide" + (r.dominada ? " on" : "") + "\" id=\"dominada\">" + (r.dominada ? "Dominada" : "Marcar dominada") + "</button>";
    html += "</div>";
    html += "<p class=\"fine\"><a class=\"link\" href=\"" + esc(clip.lessonPage) + "\" target=\"_blank\" rel=\"noopener\">Página de la lección</a></p>";
    html += "</details>";
    html += energyBlockHtml() + subEnergyHtml();
    html += "<p class=\"status\" id=\"status\">" + esc(state.status) + "</p>";
    if (state.level !== "basico" && isSubscribed()) {
      html += "<button class=\"btn wide\" id=\"cancel-sub\">Cancelar suscripción en este sitio</button>";
    }
    html += "</div>";
    html += "<aside class=\"script\" aria-label=\"Frases de este nivel\"><h2>Frases</h2>";
    list.forEach(function (c, i) {
      html += "<button type=\"button\" class=\"script-line" + (i === state.index ? " on" : "") + "\" data-jump=\"" + i + "\">";
      html += "<span class=\"script-en\">" + esc(c.en) + "</span>";
      html += "<span class=\"script-es\">" + esc(c.es) + "</span></button>";
    });
    html += "</aside></div>";
    return html;
  }

  function render() {
    renderPoints("");
    var view = $("view");
    if (!state.clips.length) {
      view.innerHTML = "<p class=\"lead\">No se pudieron cargar las frases. Abre esta carpeta con un servidor local, no con file://.</p>";
      return;
    }
    var html = state.screen === "home" ? renderHome() : (state.screen === "gate" ? renderGate() : renderPractice());
    view.innerHTML = html;
    bind();
    startWithVideoIfNeeded();
  }

  function currentClip() {
    var list = levelClips();
    return list[state.index] || null;
  }

  function tryMove(delta) {
    if (energyBlocked()) {
      state.status = EMPTY_MSG;
      render();
      return;
    }
    var n = levelClips().length;
    if (!n) return;
    state.index = (state.index + delta + n) % n;
    state.status = "";
    stopAudio();
    state.playWithVideo = true;
    render();
  }

  function bind() {
    document.querySelectorAll("[data-level]").forEach(function (btn) {
      btn.addEventListener("click", function () { openLevel(btn.getAttribute("data-level")); });
    });
    document.querySelectorAll("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (energyBlocked()) {
          state.status = EMPTY_MSG;
          render();
          return;
        }
        state.index = Number(btn.getAttribute("data-jump"));
        state.status = "";
        stopAudio();
        state.playWithVideo = true;
        render();
      });
    });
    var home = $("go-home");
    if (home) home.addEventListener("click", goHome);
    var pay = $("pay");
    if (pay) pay.addEventListener("click", function () { state.checkout = true; render(); });
    var sim = $("sim");
    if (sim) sim.addEventListener("click", simulateSub);
    var cancel = $("cancel-sub");
    if (cancel) cancel.addEventListener("click", cancelSub);
    var toBasico = $("to-basico");
    if (toBasico) toBasico.addEventListener("click", function () { openLevel("basico"); });
    document.querySelectorAll("[data-dir]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.direction = btn.getAttribute("data-dir");
        render();
      });
    });
    document.querySelectorAll("[data-cat]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (energyBlocked()) {
          state.status = EMPTY_MSG;
          render();
          return;
        }
        state.category = btn.getAttribute("data-cat");
        state.index = 0;
        state.status = "";
        stopAudio();
        render();
      });
    });
    var clip = currentClip();
    if (!clip) return;
    var play = $("play-voa");
    if (play && clip.audio) play.addEventListener("click", function () { playVoa(clip, true); });
    var vidEl = document.getElementById("clip-video");
    if (vidEl) vidEl.addEventListener("click", function () { repetir(clip); });
    var scrubEl = $("scrub");
    var scrubFill = $("scrub-fill");
    if (vidEl && scrubEl && scrubFill) {
      var paintScrub = function () {
        var dur = vidEl.duration;
        if (!dur || !isFinite(dur)) return;
        var pct = Math.max(0, Math.min(100, (vidEl.currentTime / dur) * 100));
        scrubFill.style.width = pct + "%";
        scrubEl.setAttribute("aria-valuenow", String(Math.round(pct)));
      };
      var seekScrub = function (clientX) {
        var dur = vidEl.duration;
        if (!dur || !isFinite(dur)) return;
        var rect = scrubEl.getBoundingClientRect();
        if (!rect.width) return;
        var ratio = (clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        vidEl.currentTime = ratio * dur;
        paintScrub();
      };
      vidEl.addEventListener("timeupdate", paintScrub);
      vidEl.addEventListener("loadedmetadata", paintScrub);
      vidEl.addEventListener("seeked", paintScrub);
      scrubEl.addEventListener("click", function (ev) { seekScrub(ev.clientX); });
    }
    document.querySelectorAll(".tap-word").forEach(function (btn) {
      btn.addEventListener("click", function () { showGloss(clip, btn.getAttribute("data-tok")); });
    });
    var rep = $("repetir");
    if (rep) rep.addEventListener("click", function () { repetir(clip); });
    var playResumeBtn = $("play-resume");
    if (playResumeBtn) playResumeBtn.addEventListener("click", function () { resumeMedia(clip); });
    var pauseBtn = $("pause-both");
    if (pauseBtn) pauseBtn.addEventListener("click", pauseMedia);
    var blankCheck = $("blank-check");
    if (blankCheck) blankCheck.addEventListener("click", function () { checkBlank(clip); });
    var blankInput = $("blank-input");
    if (blankInput) blankInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") checkBlank(clip);
    });
    var orderBox = $("order-box");
    if (orderBox) orderBox.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-order]");
      if (!btn) return;
      moveOrderWord(btn.getAttribute("data-order"), Number(btn.getAttribute("data-key")));
    });
    var orderCheck = $("order-check");
    if (orderCheck) orderCheck.addEventListener("click", function () { checkOrder(clip); });
    var orderReset = $("order-reset");
    if (orderReset) orderReset.addEventListener("click", function () { resetOrder(clip); });
    var orderReveal = $("order-reveal");
    if (orderReveal) orderReveal.addEventListener("click", function () { revealOrder(clip); });
    var tts = $("tts");
    if (tts) tts.addEventListener("click", function () { speakBrowser(clip); });
    var rec = $("rec");
    if (rec) rec.addEventListener("click", toggleRecord);
    var take = $("play-take");
    if (take) take.addEventListener("click", function () {
      var a = $("take");
      if (state.takeUrl) { a.src = state.takeUrl; a.play(); }
    });
    var correct = $("correct");
    if (correct) correct.addEventListener("click", function () { markCorrect(clip); });
    var wrong = $("wrong");
    if (wrong) wrong.addEventListener("click", markWrong);
    var dom = $("dominada");
    if (dom) dom.addEventListener("click", function () { toggleDominada(clip); });
    var prev = $("prev");
    if (prev) prev.addEventListener("click", function () { tryMove(-1); });
    var next = $("next");
    if (next) next.addEventListener("click", function () { tryMove(1); });
  }

  function boot() {
    energyNow();
    fetch("clips.json?v=5")
      .then(function (res) {
        if (!res.ok) throw new Error("clips");
        return res.json();
      })
      .then(function (data) {
        state.clips = data;
        render();
      })
      .catch(function () {
        $("view").innerHTML = "<p class=\"lead\">No se pudo leer clips.json. En la carpeta app ejecuta: python3 -m http.server</p>";
      });
    renderPoints("");
    setInterval(function () {
      energyNow();
      if (state.screen === "practice" && state.level && state.level !== "basico" && !isSubscribed()) {
        var st = premiumState(false);
        if (st.mode === "expired") {
          state.screen = "gate";
          state.checkout = false;
          stopAudio();
          render();
          return;
        }
        render();
      }
    }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

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
    basico: { label: "Básico", blurb: "Siempre gratis. Sin energía y sin límite." },
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
    visitPaid: false
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

  function levelClips() {
    return state.clips.filter(function (c) {
      if (c.level !== state.level) return false;
      if (state.category !== "all" && c.category !== state.category) return false;
      return true;
    });
  }

  function levelAll() {
    return state.clips.filter(function (c) { return c.level === state.level; });
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

  function playClipVideo() {
    var vid = document.getElementById("clip-video");
    if (!vid) return;
    vid.muted = true;
    vid.loop = true;
    var pending = vid.play();
    if (pending && pending.catch) pending.catch(function () {});
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
    if (!clip.audio) {
      setStatus("No hay archivo de audio de VOA en este clip. Usa «Escuchar con voz del navegador». Esa voz no es de VOA.");
      return;
    }
    var audio = $("voa");
    if (restart || !audio.src || audio.src.indexOf(clip.audio) === -1) audio.src = clip.audio;
    if (clip.startSeconds != null) audio.currentTime = clip.startSeconds;
    else if (restart) audio.currentTime = 0;
    playClipVideo();
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
    if (clip.audio) playVoa(clip, true);
    else speakBrowser(clip);
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
    var html = "<h1>Elige un nivel</h1><p class=\"lead\">Una frase a la vez. Escucha, repite y marca Dominada.</p>";
    if (state.homeNote) html += "<p class=\"warn\">" + esc(state.homeNote) + "</p>";
    html += "<div class=\"stack\">";
    Object.keys(LEVELS).forEach(function (key) {
      var n = state.clips.filter(function (c) { return c.level === key; }).length;
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
    html += "<div class=\"plan\"><b>Mensual</b><p class=\"fine\">Precio en Stripe</p></div>";
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
    var pct = totalLevel ? Math.round((done / totalLevel) * 100) : 0;
    var html = "<button class=\"back\" id=\"go-home\">← Niveles</button>";
    html += "<h1>" + LEVELS[state.level].label + "</h1>";
    html += energyBlockHtml() + subEnergyHtml();
    html += "<p class=\"lead\">" + done + " de " + totalLevel + " dominadas</p>";
    html += "<div class=\"bar\" aria-hidden=\"true\"><span style=\"width:" + pct + "%\"></span></div>";
    html += "<div class=\"row\" id=\"dirs\">";
    html += "<button class=\"chip" + (state.direction === "en-es" ? " on" : "") + "\" data-dir=\"en-es\">Inglés → Español</button>";
    html += "<button class=\"chip" + (state.direction === "es-en" ? " on" : "") + "\" data-dir=\"es-en\">Español → Inglés</button>";
    html += "</div>";
    html += "<div class=\"row\" id=\"cats\" style=\"margin-top:0.5rem\">";
    Object.keys(CATS).forEach(function (key) {
      html += "<button class=\"chip" + (state.category === key ? " on" : "") + "\" data-cat=\"" + key + "\">" + CATS[key] + "</button>";
    });
    html += "</div>";
    if (!list.length) {
      html += "<p class=\"lead\">No hay frases de esta categoría en este nivel.</p>";
      return html;
    }
    var clip = list[state.index];
    beginVisit(clip.id);
    if (state.level !== "basico") rememberPhrase(clip.id);
    var r = row(clip.id);
    html += "<article class=\"card\">";
    if (clip.video) {
      html += "<div class=\"clip-window\"><video class=\"clip-video\" id=\"clip-video\" src=\"" + esc(clip.video) + "\" muted loop playsinline autoplay></video></div>";
      html += "<p class=\"note\">Video mudo de fondo. Licencia Mixkit. No es la persona que dice la frase.</p>";
    }
    html += "<p class=\"line-label\">Inglés</p>";
    html += "<p class=\"sentence\">" + esc(clip.en) + "</p>";
    html += "<p class=\"line-label\">Español</p>";
    html += "<p class=\"translation\">" + esc(clip.es) + "</p>";
    html += "<p class=\"fine\">" + esc(CATS[clip.category] || clip.category) + "</p>";
    html += "<section class=\"pair" + (state.direction === "en-es" ? " focus" : "") + "\">";
    html += "<h2>Inglés → Español</h2>";
    html += "<p class=\"sentence\">" + esc(clip.en) + "</p>";
    html += "<p class=\"translation\">" + esc(clip.es) + "</p>";
    html += "</section>";
    html += "<section class=\"pair" + (state.direction === "es-en" ? " focus" : "") + "\">";
    html += "<h2>Español → Inglés</h2>";
    html += "<p class=\"sentence\">" + esc(clip.es) + "</p>";
    html += "<p class=\"translation\">" + esc(clip.en) + "</p>";
    html += "</section>";
    html += "<p class=\"note\">" + esc(clip.note || "") + "</p>";
    if (clip.audio) {
      html += "<p class=\"note\">Esto reproduce el audio completo de la lección, no un recorte de 5–15 segundos.</p>";
      html += "<button class=\"play\" id=\"play-voa\">Escuchar VOA</button>";
    } else {
      html += "<p class=\"note\">No hay archivo de audio de VOA. Puedes usar la voz del navegador. Esa voz no es de VOA.</p>";
      html += "<button class=\"play\" id=\"play-voa\" disabled>Audio no disponible</button>";
      html += "<p><a class=\"link\" href=\"" + esc(clip.lessonPage) + "\" target=\"_blank\" rel=\"noopener\">Abrir la lección en VOA</a></p>";
    }
    html += "<div class=\"stack\" style=\"margin-top:0.7rem\">";
    html += "<button class=\"btn primary wide\" id=\"repetir\">Repetir frase</button>";
    html += "<button class=\"btn wide\" id=\"tts\">Escuchar con voz del navegador</button>";
    html += "<button class=\"btn wide\" id=\"rec\">" + (state.recording ? "Detener" : "Grabar") + "</button>";
    html += "<button class=\"btn wide\" id=\"play-take\"" + (state.takeUrl ? "" : " disabled") + ">Escuchar mi toma</button>";
    html += "<button class=\"btn wide" + (r.repeated ? " on" : "") + "\" id=\"correct\">" + (r.repeated ? "Ya lo repetí" : "La dije bien") + "</button>";
    html += "<button class=\"btn wide\" id=\"wrong\">Me equivoqué</button>";
    html += "<button class=\"btn lime wide" + (r.dominada ? " on" : "") + "\" id=\"dominada\">" + (r.dominada ? "Dominada" : "Marcar dominada") + "</button>";
    html += "</div>";
    html += "<p class=\"status\" id=\"status\">" + esc(state.status) + "</p>";
    html += "<p class=\"fine\"><a class=\"link\" href=\"" + esc(clip.lessonPage) + "\" target=\"_blank\" rel=\"noopener\">Página de la lección</a></p>";
    html += "</article>";
    html += "<div class=\"nav\">";
    html += "<button class=\"btn\" id=\"prev\">Anterior</button>";
    html += "<button class=\"btn\" id=\"next\">Siguiente</button>";
    html += "</div>";
    html += "<p class=\"fine\" style=\"text-align:center\">Frase " + (state.index + 1) + " de " + list.length + "</p>";
    if (state.level !== "basico" && isSubscribed()) {
      html += "<button class=\"btn wide\" id=\"cancel-sub\">Cancelar suscripción en este sitio</button>";
    }
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
    render();
  }

  function bind() {
    document.querySelectorAll("[data-level]").forEach(function (btn) {
      btn.addEventListener("click", function () { openLevel(btn.getAttribute("data-level")); });
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
    var rep = $("repetir");
    if (rep) rep.addEventListener("click", function () { repetir(clip); });
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
    fetch("clips.json")
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

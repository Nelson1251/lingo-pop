(function () {
  "use strict";

  var KEYS = {
    progress: "lingo-pop-progress",
    points: "lingo-pop-points",
    awarded: "lingo-pop-awarded",
    trial: "lingo-pop-trial-started-at",
    sub: "lingo-pop-demo-subscription"
  };
  var TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
  var LEVELS = {
    basico: { label: "Básico", blurb: "Siempre gratis. Sin prueba y sin límite." },
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

  var state = {
    clips: [],
    screen: "home",
    level: null,
    index: 0,
    category: "all",
    direction: "en-es",
    showTr: false,
    checkout: false,
    status: "",
    recorder: null,
    chunks: [],
    takeUrl: "",
    recording: false
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

  function premiumState(startIfMissing) {
    if (isSubscribed()) return { mode: "sub" };
    var existing = localStorage.getItem(KEYS.trial);
    var iso = existing;
    if (!iso && startIfMissing) iso = startTrialIfNeeded();
    if (!iso) return { mode: "not-started" };
    var days = remainingDays(iso, Date.now());
    if (days > 0) return { mode: "trial", days: days };
    return { mode: "expired" };
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
    el.textContent = "Puntos: " + points() + (extra || "");
    if (extra) {
      el.classList.add("flash");
      setTimeout(function () { el.classList.remove("flash"); }, 1200);
    }
  }

  function stopAudio() {
    var voa = $("voa");
    voa.pause();
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

  function playVoa(clip, restart) {
    if (!clip.audio) {
      setStatus("No hay archivo de audio de VOA en este clip. Usa «Escuchar con voz del navegador». Esa voz no es de VOA.");
      return;
    }
    var audio = $("voa");
    var src = clip.audio;
    if (restart || !audio.src || audio.src.indexOf(src) === -1) {
      audio.src = src;
    }
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
    if (clip.audio) playVoa(clip, true);
    else speakBrowser(clip);
  }

  function toggleRecord(clip) {
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

  function openLevel(level) {
    state.level = level;
    state.index = 0;
    state.category = "all";
    state.showTr = false;
    state.checkout = false;
    state.status = "";
    stopAudio();
    if (level === "basico") {
      state.screen = "practice";
      render();
      return;
    }
    var st = premiumState(true);
    state.screen = st.mode === "expired" ? "gate" : "practice";
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
    state.status = "Suscripción demo activa. No se cobró nada.";
    render();
  }

  function cancelSub() {
    setSubscribed(false);
    state.status = "Suscripción demo cancelada en este sitio. Los puntos no cambian.";
    if (state.level && state.level !== "basico") {
      var st = premiumState(false);
      state.screen = st.mode === "expired" ? "gate" : (state.screen === "home" ? "home" : "practice");
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
    renderPoints(extra);
    render();
    if (extra) renderPoints(extra);
  }

  function markRepeated(clip) {
    var r = row(clip.id);
    r.repeated = !r.repeated;
    saveRow(clip.id, r);
    render();
  }

  function bannerFor(level) {
    if (level === "basico") return "";
    var st = premiumState(false);
    if (st.mode === "sub") return "Suscripción demo activa · sin cobro";
    if (st.mode === "trial") return trialLabel(st.days);
    if (st.mode === "expired") return "Prueba terminada";
    return "7 días de prueba la primera vez que entres";
  }

  function renderHome() {
    var html = "<h1>Elige un nivel</h1><p class=\"lead\">Una frase a la vez. Escucha, repite y marca Dominada.</p><div class=\"stack\">";
    Object.keys(LEVELS).forEach(function (key) {
      var n = state.clips.filter(function (c) { return c.level === key; }).length;
      var extra = key === "basico" ? "Siempre gratis." : esc(bannerFor(key));
      html += "<button class=\"level-btn " + key + "\" data-level=\"" + key + "\"><strong>" +
        LEVELS[key].label + "</strong><span>" + n + " frases · " + extra + "</span></button>";
    });
    html += "</div>";
    if (isSubscribed()) {
      html += "<p class=\"fine\">La suscripción demo está activa en este navegador.</p>";
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

  function renderPractice() {
    var list = levelClips();
    if (state.index >= list.length) state.index = 0;
    var totalLevel = levelAll().length;
    var done = dominadasInLevel();
    var pct = totalLevel ? Math.round((done / totalLevel) * 100) : 0;
    var html = "<button class=\"back\" id=\"go-home\">← Niveles</button>";
    html += "<h1>" + LEVELS[state.level].label + "</h1>";
    var banner = state.level === "basico" ? "" : bannerFor(state.level);
    if (banner && state.level !== "basico") {
      var st = premiumState(false);
      if (st.mode === "trial" || st.mode === "sub") html += "<p class=\"warn\">" + esc(banner) + "</p>";
    }
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
    var r = row(clip.id);
    var prompt = state.direction === "en-es" ? clip.en : clip.es;
    var hidden = state.direction === "en-es" ? clip.es : clip.en;
    html += "<article class=\"card\">";
    html += "<p class=\"fine\">" + esc(CATS[clip.category] || clip.category) + "</p>";
    html += "<p class=\"sentence\">" + esc(prompt) + "</p>";
    html += "<button class=\"btn\" id=\"toggle-tr\">" + (state.showTr ? "Ocultar traducción" : "Ver traducción") + "</button>";
    if (state.showTr) html += "<p class=\"translation\">" + esc(hidden) + "</p>";
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
    html += "<button class=\"btn wide" + (r.repeated ? " on" : "") + "\" id=\"repeated\">" + (r.repeated ? "Repetido" : "Ya lo repetí") + "</button>";
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
    var html = "";
    if (!state.clips.length) {
      view.innerHTML = "<p class=\"lead\">No se pudieron cargar las frases. Abre esta carpeta con un servidor local, no con file://.</p>";
      return;
    }
    if (state.screen === "home") html = renderHome();
    else if (state.screen === "gate") html = renderGate();
    else html = renderPractice();
    view.innerHTML = html;
    bind();
  }

  function currentClip() {
    var list = levelClips();
    return list[state.index] || null;
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
        state.showTr = false;
        render();
      });
    });
    document.querySelectorAll("[data-cat]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.category = btn.getAttribute("data-cat");
        state.index = 0;
        state.showTr = false;
        stopAudio();
        render();
      });
    });
    var tr = $("toggle-tr");
    if (tr) tr.addEventListener("click", function () { state.showTr = !state.showTr; render(); });
    var clip = currentClip();
    if (!clip) return;
    var play = $("play-voa");
    if (play && clip.audio) play.addEventListener("click", function () { playVoa(clip, true); });
    var rep = $("repetir");
    if (rep) rep.addEventListener("click", function () { repetir(clip); });
    var tts = $("tts");
    if (tts) tts.addEventListener("click", function () { speakBrowser(clip); });
    var rec = $("rec");
    if (rec) rec.addEventListener("click", function () { toggleRecord(clip); });
    var take = $("play-take");
    if (take) take.addEventListener("click", function () {
      var a = $("take");
      if (state.takeUrl) { a.src = state.takeUrl; a.play(); }
    });
    var repeated = $("repeated");
    if (repeated) repeated.addEventListener("click", function () { markRepeated(clip); });
    var dom = $("dominada");
    if (dom) dom.addEventListener("click", function () { toggleDominada(clip); });
    var prev = $("prev");
    if (prev) prev.addEventListener("click", function () {
      var n = levelClips().length;
      if (!n) return;
      state.index = (state.index - 1 + n) % n;
      state.showTr = false;
      state.status = "";
      stopAudio();
      render();
    });
    var next = $("next");
    if (next) next.addEventListener("click", function () {
      var n = levelClips().length;
      if (!n) return;
      state.index = (state.index + 1) % n;
      state.showTr = false;
      state.status = "";
      stopAudio();
      render();
    });
  }

  function boot() {
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
      if (state.screen === "practice" && state.level && state.level !== "basico") {
        var st = premiumState(false);
        if (st.mode === "expired") {
          state.screen = "gate";
          state.checkout = false;
          stopAudio();
          render();
        }
      }
    }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

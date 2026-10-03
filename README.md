# Lingo Pop

App estática para practicar frases de VOA Learning English. Sin build, sin cuentas y sin APIs de pago.

## Abrir en local

`file://` puede bloquear `fetch` de `clips.json`. Desde esta carpeta:

```bash
python3 -m http.server 8765
```

Abre http://127.0.0.1:8765/

## Publicar gratis

Sube **esta carpeta** (`app/`) como raíz del sitio. No hace falta npm.

- GitHub Pages (rama `main`, carpeta `/`)
- Cloudflare Pages
- Netlify Free

## Qué hace

- Niveles: Básico (siempre gratis), Intermedio y Avanzado.
- Intermedio y Avanzado: 7×24 h de prueba desde la primera vez que entras (`lingo-pop-trial-started-at`). Los días se calculan con esa fecha.
- Después de la prueba, un plan **Mensual** en modo prueba. No hay precio inventado ni cobro. No hay clave de Stripe.
- **Simular suscripción activa (sin cobro)** guarda un flag local. **Cancelar suscripción en este sitio** lo borra.
- Puntos globales en `lingo-pop-points`: +10 la primera vez que marcas Dominada. No se restan ni se ponen en cero.
- Traducción en las dos direcciones, Repetir frase, audio VOA si el mp3 está en `media/`, y voz del navegador bien identificada si no hay archivo.

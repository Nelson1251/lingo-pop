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

- Niveles: Principiante (siempre gratis), Completo y Avanzado.
- Completo y Avanzado: 7×24 h de prueba desde la primera vez que entras (`lingo-pop-trial-started-at`). Los días se calculan con esa fecha.
- Después de la prueba, un plan **Mensual** en modo prueba. No hay precio inventado ni cobro. No hay clave de Stripe.
- **Simular suscripción activa (sin cobro)** guarda un flag local. **Cancelar suscripción en este sitio** lo borra.
- Puntos globales en `lingo-pop-points`: +10 la primera vez que marcas Dominada. No se restan ni se ponen en cero.
- Traducción en las dos direcciones, Repetir frase, audio VOA si el mp3 está en `media/`, y voz del navegador bien identificada si no hay archivo.

## Energía

Solo Completo y Avanzado. Máximo 25 (`lingo-pop-energy` y `lingo-pop-energy-updated`). Sube 1 por cada hora completa; los minutos sobrantes se conservan. «La dije bien» / «Ya lo repetí» al activarse gasta 1 una vez por visita. «Me equivoqué» gasta 1 y pone la racha en cero. Cada 5 aciertos seguidos suman 2, con tope 25. En 0 no se abre otra frase; Repetir frase sigue. Principiante no gasta. La suscripción demo deja la energía ilimitada. Los puntos no se reinician.

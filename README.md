---
title: Quiz VRM/VA · CNSC
emoji: 🎯
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Quiz VRM/VA · CNSC — capacitación interactiva en tiempo real

Aplicación web ligera (estilo *quiz* en vivo) para la capacitación de las
personas contratadas como **VRM** (Verificación de Requisitos Mínimos) y
**VA** (Valoración de Antecedentes). El supervisor expone los criterios
(educación, experiencia, alternativas y equivalencias), activa preguntas una
a una y los participantes responden desde su celular ingresando **una sola
vez** por código QR. El sistema puntúa, muestra caritas de desempeño, arma el
ranking en vivo, acumula resultados pregunta a pregunta (con subidas y
bajadas de posición) y permite hacer sorteos aleatorios.

Diseñada para **60–70 personas simultáneas** sin problema: servidor Node.js
con WebSockets, páginas estáticas sin frameworks y payloads mínimos.

## Puesta en marcha

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start
```

Para probarla por primera vez existe un atajo que arranca el servidor y
**abre solo las tres ventanas** (pantalla, supervisor y participante) en el
navegador del computador:

```bash
npm run demo
```

El servidor imprime las URL disponibles. Los tres roles son:

| Rol | URL | Descripción |
|---|---|---|
| Participante | `http://<ip-del-servidor>:3000/` | La que codifica el QR. Se ingresa con el nombre. |
| Supervisor | `http://<ip-del-servidor>:3000/admin` | Dirige la sesión (requiere código de acceso). |
| Pantalla | `http://<ip-del-servidor>:3000/pantalla` | Se proyecta con el video beam (requiere código). |

Variables de entorno opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor. |
| `ADMIN_CODE` | `cnsc2026` | Código de acceso del supervisor y de la pantalla. **Cámbialo antes del evento.** |
| `PUBLIC_URL` | *(host de la petición)* | URL que codifica el QR, si el servidor está detrás de un dominio o túnel. |
| `SHOW_RESULT_ON_ANSWER` | `true` | Si es `false`, la carita y el puntaje solo se revelan al cerrar la pregunta (evita que se sople la respuesta). |
| `AUTO_CLOSE` | `true` | Cierra la pregunta antes de los 3 minutos si ya todos los conectados respondieron. |

## Flujo de una sesión

1. **Proyecta** `/pantalla` (portada con el QR gigante). Las personas escanean
   el QR **una sola vez**, escriben su nombre y quedan en sala de espera; sus
   nombres van apareciendo en la pantalla. Todas las preguntas se juegan sobre
   ese mismo ingreso: no hay que volver a escanear.
2. El supervisor expone el criterio del día y desde `/admin` pulsa
   **“Activar siguiente pregunta”**. La pregunta aparece al tiempo en la
   pantalla y en los celulares, con el conteo regresivo de **3 minutos**
   (configurable por pregunta).
3. Cada persona responde una sola vez. Al responder ve de inmediato su carita
   y su puntaje. Quien no responda dentro del tiempo recibe **0 puntos**
   (se considera que no le alcanzó el tiempo).
4. Al cerrarse la pregunta (por tiempo, porque todos respondieron o porque el
   supervisor la cierra manualmente), la pantalla muestra los **resultados de
   la pregunta**: respuesta correcta, distribución de respuestas por opción,
   resumen de caritas y el top de los más rápidos y precisos. Cada
   participante ve en su celular su carita, su puntaje, su **puesto** y los
   primeros lugares.
5. Con los botones de pantalla el supervisor alterna entre **Resultados de la
   pregunta**, **Tabla general** (acumulado de la 1ª a la última posición, con
   ▲/▼ de cuántos puestos subió o bajó cada quien y sus caritas pregunta a
   pregunta) y **Sorteo aleatorio** (elige una persona al azar con animación y
   muestra su pregunta, su respuesta y cómo le fue).
6. Se repite desde el paso 2 con la siguiente pregunta. El acumulado se va
   separando pregunta a pregunta automáticamente.

## Puntuación y caritas

- Respuesta **correcta**: entre **500 y 1000 puntos** según la rapidez
  (`500 + 500 × tiempo restante / tiempo total`).
- Respuesta **incorrecta** o **sin responder**: **0 puntos**.
- Desempates en el ranking: menor tiempo acumulado de respuesta.

| Carita | Significado |
|---|---|
| 😄 Feliz | Correcta y rápida (primera mitad del tiempo) |
| 😠 Enojada | Correcta pero lenta (segunda mitad del tiempo) |
| 😢 Triste | Incorrecta |
| 😭 Llorando | No respondió: el tiempo se agotó (0 puntos) |

## Preguntas

El banco vive en `data/questions.json` (el archivo incluido trae **10
preguntas de ejemplo sobre los criterios de educación en la VRM**; revísalas y
ajústalas con el equipo antes del evento). También se pueden crear, editar y
eliminar desde el panel `/admin` — las preguntas ya jugadas quedan bloqueadas.
Cada pregunta admite de 2 a 6 opciones, una correcta, y su propio tiempo
límite en segundos (por defecto 180 = 3 minutos).

## Detalles operativos

- **Reconexión sin perder puntos**: si a alguien se le cierra el navegador o
  se le cae la señal, al volver a abrir el enlace entra automáticamente con su
  mismo nombre y puntaje (token guardado en el dispositivo).
- **Persistencia**: la sesión se guarda en `data/session.json`; si el servidor
  se reinicia a mitad de jornada, se retoma donde iba (incluida la pregunta
  activa, que se cierra sola si su tiempo ya venció).
- **Reiniciar sesión**: el botón correspondiente en `/admin` borra
  participantes y puntajes (las preguntas se conservan) para empezar otra
  jornada, por ejemplo el día de "experiencia".
- **Reloj del servidor**: el tiempo lo controla el servidor; las respuestas
  tardías se rechazan aunque el celular tenga el reloj desajustado.
- Los participantes y la pantalla deben poder llegar al servidor: en un salón
  basta un PC en la red WiFi local (el QR usa la IP local) o un despliegue en
  cualquier servicio que sirva Node.js.

## Publicar en internet (URL pública)

Para que las personas entren desde cualquier red (no solo el WiFi del salón),
la aplicación puede desplegarse gratis. El QR se genera solo con la URL
pública, sin configurar nada.

### Opción A · Hugging Face Spaces (con el `Dockerfile` incluido)

1. Entra a <https://huggingface.co/new-space>.
2. Nombre del Space: por ejemplo `quiz-vrm`; **SDK: Docker** (plantilla
   *Blank*); visibilidad **Public**; hardware gratuito (CPU basic).
3. En la pestaña **Files** del Space sube todos los archivos del proyecto
   (incluido el `Dockerfile`; no subas `node_modules` ni `data/session.json`).
   También puedes subirlos con git:
   `git push https://huggingface.co/spaces/TU_USUARIO/quiz-vrm`.
4. En **Settings → Variables and secrets** crea el secreto `ADMIN_CODE` con
   tu propio código de supervisor.
5. Al terminar la construcción, la app queda en
   `https://TU_USUARIO-quiz-vrm.hf.space` → esa URL es la de los
   participantes; `/admin` y `/pantalla` funcionan igual.

### Opción B · Render (con el `render.yaml` incluido)

1. Entra a <https://render.com> → **New +** → **Blueprint**.
2. Conecta este repositorio de GitHub; Render lee `render.yaml` y crea el
   servicio. Define el valor de `ADMIN_CODE` cuando lo pida.
3. La app queda en `https://quiz-vrm-cnsc.onrender.com` (o similar).
   En el plan gratuito el servicio se duerme tras ~15 min sin uso y tarda
   unos segundos en despertar con la primera visita.

En ambos casos la sesión (participantes y puntajes) vive en el contenedor:
si el servicio se reinicia, la sesión vuelve a empezar. Para la jornada de
capacitación, abre la pantalla unos minutos antes y evita reiniciar.

## Prueba de humo

```bash
npm run smoke
```

Levanta un servidor de prueba y simula supervisor + pantalla + participantes:
ingreso, respuesta correcta/incorrecta/sin responder, puntuación, caritas,
ranking, reconexión, sorteo y QR.

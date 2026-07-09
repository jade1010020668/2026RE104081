# TRASPASO COMPLETO — Quiz VRM/VA · CNSC

> **Propósito de este documento:** contener **absolutamente todo** el contexto,
> el código, las decisiones y el estado del proyecto, para poder:
> 1. Descargar el proyecto y **ejecutarlo en un servidor local**.
> 2. **Retomar el trabajo en un chat nuevo** sin perder nada.
>
> Última actualización: 9 de julio de 2026.

---

## 0. RESUMEN EN UNA FRASE

Aplicación web tipo *quiz* en vivo (estilo Kahoot) para capacitar a las **66
personas** contratadas como **VRM** (Verificación de Requisitos Mínimos) y **VA**
(Valoración de Antecedentes) de la CNSC. El capacitador activa preguntas una a
una desde un panel; las personas entran por **código QR** desde su celular,
responden en **3 minutos**, y ven en tiempo real su **carita de desempeño**, su
**puntaje** y el **ranking**. Incluye **sorteo aleatorio** y **tabla general
acumulada** con subidas/bajadas de posición.

**Estado: la aplicación está 100 % terminada y probada.** Lo único pendiente es
publicarla en una URL pública (ver sección 9).

---

## 1. CÓMO EJECUTARLO EN UN SERVIDOR LOCAL (lo más importante)

### Requisitos
- **Node.js 18 o superior** — descárgalo de https://nodejs.org (versión LTS).

### Pasos (en la terminal / PowerShell)

```bash
# 1. Descargar el proyecto desde GitHub
git clone -b claude/vrm-assessment-app-hr4055 https://github.com/jade1010020668/2026RE104081.git

# 2. Entrar a la carpeta
cd 2026RE104081

# 3. Instalar las dependencias (una sola vez)
npm install

# 4a. Arrancar y abrir las 3 ventanas automáticamente:
npm run demo

# 4b. …o arrancar sin abrir ventanas:
npm start
```

Si no tienes git, descarga el ZIP desde:
`https://github.com/jade1010020668/2026RE104081/archive/refs/heads/claude/vrm-assessment-app-hr4055.zip`
descomprímelo, y desde esa carpeta corre `npm install` y `npm start`.

### Al arrancar, la terminal imprime las 3 direcciones:

| Vista | URL local | Para quién |
|---|---|---|
| **Participantes** | `http://localhost:3000/` | El QR. Cada persona entra con su nombre. |
| **Supervisor** | `http://localhost:3000/admin` | El capacitador (pide código). |
| **Pantalla** | `http://localhost:3000/pantalla` | El video beam (pide código). |

> El puerto puede variar (3001, 3002…) si el 3000 está ocupado — **usa siempre
> las URL que imprime la terminal**. El QR se genera solo con la IP correcta.

### Para el evento en un salón (sin internet)
Basta un computador conectado al **WiFi local** del salón y al video beam. El QR
usa la IP de la red local, así que los 66 celulares entran escaneándolo sin
necesidad de internet externo. Es liviano: 66 personas es carga mínima.

### Código de acceso del supervisor/pantalla
Por defecto es **`cnsc2026`**. Cámbialo con la variable de entorno `ADMIN_CODE`
(ver sección 8). **Cámbialo antes del evento.**

---

## 2. LA IDEA COMPLETA (contexto del proyecto)

La CNSC hizo una convocatoria para contratar 66 personas que serán VRM y VA de un
proceso de selección. Antes de empezar hay que **capacitarlas en las reglas de
educación, experiencia, alternativas y equivalencias**, de forma **interactiva**.

El flujo pensado por el usuario (dueño del proyecto):
- El capacitador expone un criterio (ej: educación) y **activa una pregunta** en
  tiempo real.
- Las personas escanean el **QR una sola vez**, se loguean con su nombre y
  responden desde el celular. Sobre ese mismo QR se trabajan todas las preguntas.
- Cada pregunta tiene **3 minutos**. Apenas la persona responde, el sistema le
  muestra **de inmediato** cómo le fue con una **carita** (feliz, enojada, triste,
  llorando).
- Se **tabula a todas las personas en tiempo real** y se arma un **ranking** de la
  primera a la última posición (con espíritu de juego, para que todos participen
  sin que nadie se sienta mal).
- El perfil supervisor puede hacer un **sorteo** y elegir una persona al azar,
  mostrando su pregunta, su respuesta y cómo le fue.
- Todos ven un **dashboard bonito** con los indicadores.
- Al activar la 2ª pregunta, se separan sus datos y se hace un **acumulado**,
  viendo quién subió y quién bajó puestos.
- Debe ser **liviana**, que las 66 personas entren sin que se caiga.
- Quien **no responde en los 3 minutos** obtiene **0 puntos** (no le alcanzó el
  tiempo) y se cierra su pregunta.

**Todo lo anterior está implementado.**

---

## 3. LAS TRES VISTAS (qué hace cada una)

### Participante — `/` (celular, tema claro)
- Pide el nombre y entra a sala de espera.
- Al activarse la pregunta: la ve con botones de colores y el conteo de 3:00.
- Al responder: ve su **carita**, su **puntaje**, su **puesto** y el top 5.
- **Reconexión:** si se cae la señal o cierra el navegador, al reabrir el enlace
  entra automáticamente con su mismo nombre y puntaje (token guardado en el
  dispositivo).

### Supervisor — `/admin` (requiere código)
La "cabina de mando" del capacitador:
- **Activar siguiente pregunta** / **Cerrar pregunta ahora**.
- Controlar qué muestra la pantalla proyectada: **Portada/QR**, **Resultados de la
  pregunta**, **Tabla general**, **Sorteo**.
- Ver en vivo cuántos han respondido.
- **Crear, editar y eliminar preguntas** (las ya jugadas quedan bloqueadas).
- **Retirar participantes** y **reiniciar la sesión** (para otra jornada).

### Pantalla — `/pantalla` (video beam, tema oscuro; requiere código)
- **Portada:** logo del proceso + nombre + QR gigante + nombres entrando.
- **Pregunta:** enunciado grande con conteo regresivo.
- **Resultados de la pregunta:** respuesta correcta, distribución por opción
  (cuántos marcaron A/B/C/D), resumen de caritas, top de los más rápidos.
- **Tabla general:** acumulado de la 1ª a la última posición, con flechas ▲/▼ de
  cuántos puestos subió o bajó cada quien, y sus caritas pregunta a pregunta.
- **Sorteo:** animación tipo ruleta y ficha del ganador (su respuesta y resultado).

---

## 4. REGLAS DEL JUEGO (implementadas)

- **Tiempo:** 3 minutos por pregunta (configurable por pregunta, 10–600 s). El
  reloj lo controla el **servidor** (las respuestas tardías se rechazan aunque el
  celular tenga la hora mal). La pregunta también se cierra sola si todos los
  conectados ya respondieron, o si el supervisor la cierra.
- **Puntuación:** correcta = **500 a 1000 puntos** según rapidez
  (`500 + 500 × tiempo_restante / tiempo_total`). Incorrecta o sin responder = **0**.
- **Desempate en el ranking:** menor tiempo acumulado de respuesta.
- **Caritas por pregunta:**

  | Carita | Significado |
  |---|---|
  | 😄 Feliz | Correcta y rápida (primera mitad del tiempo) |
  | 😠 Enojada | Correcta pero lenta (segunda mitad) |
  | 😢 Triste | Incorrecta |
  | 😭 Llorando | No respondió — se agotó el tiempo (0 puntos) |

---

## 5. ESTRUCTURA DE ARCHIVOS (qué es cada cosa)

```
2026RE104081/
├── server.js               Servidor web + tiempo real (Socket.IO) + QR + persistencia
├── package.json            Dependencias y scripts (start, demo, smoke)
├── Dockerfile              Para desplegar en contenedores / Hugging Face (puerto 7860)
├── render.yaml             Para desplegar en Render con un clic
├── lib/
│   └── game.js             TODA la lógica del juego: puntuación, caritas,
│                           rankings, sorteo, acumulado, persistencia
├── data/
│   ├── questions.json      Banco de 30 preguntas (editable)
│   └── branding.json       Logo, entidad, nombre del proceso, lema
├── public/
│   ├── index.html          Vista participante
│   ├── admin.html          Vista supervisor
│   ├── pantalla.html       Vista pantalla proyectada
│   ├── css/styles.css      Estilos (paleta validada, temas claro/oscuro)
│   ├── js/common.js        Utilidades compartidas + branding + temporizador
│   ├── js/participant.js   Lógica de la vista participante
│   ├── js/admin.js         Lógica del panel supervisor
│   ├── js/screen.js        Lógica de la pantalla proyectada
│   └── img/logo.svg        Logo (provisional — reemplazar por el oficial)
├── scripts/
│   ├── demo.js             `npm run demo`: arranca y abre las 3 ventanas
│   └── smoke-test.js       `npm run smoke`: prueba automática de punta a punta
├── README.md               Documentación de uso (con cabecera para HF Spaces)
├── PROYECTO.md             Documento maestro del proyecto
├── BANCO_PREGUNTAS.md      Las 30 preguntas con respuesta y sustento normativo
└── TRASPASO.md             ESTE documento
```

**Tecnología:** Node.js + Express + Socket.IO (WebSockets) en el servidor;
HTML/CSS/JS puro en el frontend (sin frameworks, muy liviano). El QR se genera
con la librería `qrcode`. La sesión se guarda en `data/session.json` (se recupera
si el servidor se reinicia). Reconexión por token guardado en el celular.

---

## 6. BANCO DE PREGUNTAS

- **30 preguntas** cargadas en `data/questions.json`, en 3 bloques de 10,
  ordenadas de **fácil a difícil**:
  - **1–10 Educación** (diploma vs. acta, examen ICFES, sábana de notas, firmas
    del diploma, técnico laboral vs. título, títulos del exterior, nivel superior,
    "cursando" vs. "aprobado", posgrado sin pregrado, suma de cursos).
  - **11–20 Experiencia** (pensum, contenido mínimo de certificaciones, experiencia
    laboral sin funciones, "se encuentra vinculado", solo año, jornada < 8h,
    tiempos traslapados, auxiliar contable ≠ profesional, actas de posesión,
    judicatura).
  - **21–30 Alternativas y equivalencias** (especialización = 2 años, etapa de
    aplicación, maestría = 3 años, tecnológico = 1 año relacionada, especialización
    tecnológica sin equivalencia, MEFCL no crea equivalencias, 3 años exp. = título
    adicional, posgrado no equivale a relacionada, tarjeta profesional no se
    compensa, no aplica a salud).
- Construidas a partir del **Criterio Unificado de VRM y VA** (Sala Plena CNSC, 18
  de febrero de 2021) y su **Anexo Técnico de Casos** (documentos que aportó el
  usuario). Cada caso traía solo la respuesta correcta; se redactaron los 3
  distractores ("cascaritas") con los errores más comunes.
- **`BANCO_PREGUNTAS.md`** tiene cada pregunta con la respuesta correcta marcada y
  el **sustento normativo** (artículo del decreto o nº de caso del anexo).
- **Pendiente:** que el equipo VRM revise el contenido. Quedan casos para más
  preguntas (ingenierías/matrícula Ley 842, salud/RETHUS, títulos SENA por fechas,
  docentes hora cátedra, vigencia de certificados de idiomas, fechas en letras vs.
  números). Los 3 PDF adicionales del paquete ("Complementación" ×2 y "Títulos del
  Exterior") aún no se explotaron.

---

## 7. IDENTIDAD VISUAL (branding)

- Editable en `data/branding.json` **sin tocar código**:
  ```json
  {
    "entidad": "Comisión Nacional del Servicio Civil",
    "proceso": "Procesos de Selección Territorial",
    "actividad": "Capacitación VRM · VA",
    "lema": "Igualdad, mérito y oportunidad",
    "logo": "/img/logo.svg"
  }
  ```
- **Logo:** hay uno provisional en `public/img/logo.svg` (un pin territorial con
  chulo de verificación). **Reemplazar por el logo oficial** del Proceso de
  Selección Territorial: pon el archivo oficial como `public/img/logo.svg` (o
  cambia la ruta en `branding.json`).

---

## 8. CONFIGURACIÓN (variables de entorno, opcionales)

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `ADMIN_CODE` | `cnsc2026` | Código del supervisor y la pantalla — **cambiarlo** |
| `PUBLIC_URL` | *(automática)* | URL que codifica el QR si hay dominio propio |
| `SHOW_RESULT_ON_ANSWER` | `true` | En `false`, la carita solo se revela al cerrar la pregunta (evita soplos) |
| `AUTO_CLOSE` | `true` | Cierra antes de tiempo si ya todos respondieron |

Ejemplo en Windows PowerShell: `$env:ADMIN_CODE="miClave2026"; npm start`
Ejemplo en Linux/Mac: `ADMIN_CODE=miClave2026 npm start`

---

## 9. PUBLICAR EN INTERNET (estado y por qué quedó pendiente)

La app trae dos formas de despliegue listas:
- **`Dockerfile`** para **Hugging Face Spaces** (SDK Docker, puerto 7860). El
  `README.md` ya trae la cabecera YAML que configura el Space como Docker.
- **`render.yaml`** para **Render** (Blueprint de un clic desde GitHub).

**Por qué NO se pudo publicar desde el chat con el asistente en la nube:**
- El asistente "Claude Code" corre en un entorno con **egress bloqueado hacia
  Hugging Face** (la red de ese entorno devuelve 403 a huggingface.co).
- El token de GitHub de ese entorno **no tiene permiso** para configurar secretos
  (403 en el endpoint de Actions secrets).
- Por seguridad, **nadie externo puede escribir en una cuenta de HF/GitHub sin la
  autenticación del dueño**, que solo vive en su navegador.

Se creó un Space `MORALES101002/quiz-vrm` pero quedó **vacío/mal** (se subió el
ZIP en vez de los archivos). Se instaló una **GitHub Action** (`.github/workflows/
deploy-hf.yml`) que publica automáticamente al Space, pero necesita el secreto
`HF_TOKEN` configurado en GitHub (paso que requiere acción del dueño en su
navegador, o el uso de la extensión **"Claude en Chrome"**, que es un Claude
distinto que sí puede actuar en el navegador).

**Decisión del usuario:** pasar todo a un **servidor local** (sección 1). Esa es
la vía más simple y no depende de ningún permiso externo.

### Opción recomendada para tener URL pública sin depender del chat
Si se quiere URL pública, la vía más limpia es, **desde el propio navegador del
usuario** (o con la extensión Claude en Chrome):
1. Crear un token **Write** en https://huggingface.co/settings/tokens
2. Crear el secreto `HF_TOKEN` en
   https://github.com/jade1010020668/2026RE104081/settings/secrets/actions/new
3. Ejecutar el workflow "Publicar en Hugging Face Space" en la pestaña Actions.
El Space quedaría en `https://morales101002-quiz-vrm.hf.space` (con `/admin` y
`/pantalla`).

---

## 10. ESTADO ACTUAL (checklist)

- [x] Aplicación completa (3 vistas, QR, 3 min, caritas, ranking ▲▼, sorteo, dashboard)
- [x] Reconexión sin perder puntaje + persistencia de sesión
- [x] Búsqueda automática de puerto libre
- [x] Identidad visual configurable (logo, entidad, proceso, lema)
- [x] Banco de 30 preguntas basado en el Criterio Unificado + Anexo de Casos
- [x] Prueba automática de punta a punta (`npm run smoke`, 22 verificaciones) — verde
- [x] Prueba visual en navegador real (capturas)
- [x] Todo en GitHub, rama `claude/vrm-assessment-app-hr4055`
- [x] Dockerfile + render.yaml + workflow de auto-publicación
- [ ] **Logo oficial** del proceso (hay uno provisional)
- [ ] **Revisión del contenido** de las preguntas por el equipo VRM
- [ ] **URL pública** (elegir: servidor local / HF Space / Render)
- [ ] Definir `ADMIN_CODE` definitivo
- [ ] Piloto con celulares reales antes del evento
- [ ] Bancos de preguntas de las otras jornadas (experiencia, alternativas, equivalencias como jornadas propias)

---

## 11. CÓMO CONTINUAR EN UN CHAT NUEVO

Pega este bloque al inicio del nuevo chat para dar contexto completo al asistente:

> Estoy retomando un proyecto ya construido: una app web tipo quiz en vivo
> (estilo Kahoot) para capacitar a 66 personas VRM/VA de la CNSC. El código está
> en GitHub: `https://github.com/jade1010020668/2026RE104081`, rama
> `claude/vrm-assessment-app-hr4055`. Es Node.js + Express + Socket.IO; frontend
> HTML/CSS/JS puro. Tiene 3 vistas: participante `/`, supervisor `/admin`,
> pantalla `/pantalla`. Reglas: 3 min por pregunta, puntaje 500–1000 por rapidez,
> caritas 😄😠😢😭, ranking en vivo con ▲▼, sorteo. Banco de 30 preguntas en
> `data/questions.json` (educación, experiencia, equivalencias). El detalle
> completo está en el archivo `TRASPASO.md` del repositorio. Quiero
> [DECIR AQUÍ QUÉ QUIERES: correrlo local / desplegarlo / editar preguntas / etc.].

**Para trabajar local**, clona el repo (sección 1) y ábrelo con el asistente en la
carpeta; que lea `TRASPASO.md`, `PROYECTO.md` y `BANCO_PREGUNTAS.md` para tener
todo el contexto.

---

## 12. SEGURIDAD — REVOCAR CREDENCIALES EXPUESTAS ⚠️

Durante la conversación se pegaron en el chat varias credenciales que **deben
revocarse** en https://huggingface.co/settings/tokens :
- Varios tokens de acceso `hf_...` (todos los que se pegaron).
- Las llaves S3: `AWS_ACCESS_KEY_ID` (empieza por `HFAK...`) y su
  `AWS_SECRET_ACCESS_KEY`.

Ninguna es necesaria para correr la app en local. Revócalas por seguridad. Para
publicar en HF más adelante, crea un token **nuevo** y ponlo **solo** como secreto
en GitHub o en la configuración del Space (nunca en un chat).

---

## 13. ENLACES ÚTILES

- **Repositorio:** https://github.com/jade1010020668/2026RE104081
- **Rama:** `claude/vrm-assessment-app-hr4055`
- **ZIP directo:** https://github.com/jade1010020668/2026RE104081/archive/refs/heads/claude/vrm-assessment-app-hr4055.zip
- **Demo interactiva** (simulación, sin instalar nada): https://claude.ai/code/artifact/f65184e7-6f4f-43a2-944a-ea12ea60b005
- **Space (vacío, por publicar):** https://huggingface.co/spaces/MORALES101002/quiz-vrm

# Proyecto: Quiz VRM/VA · CNSC

**Documento maestro del proyecto** — la idea, lo construido, cómo funciona,
la técnica y lo que falta. Última actualización: 8 de julio de 2026.

---

## 1. La idea

La Comisión Nacional del Servicio Civil (CNSC) contrató **66 personas** que
actuarán como **VRM** (Verificación de Requisitos Mínimos) y **VA**
(Valoración de Antecedentes) en un proceso de selección. Antes de empezar,
hay que **capacitarlas en las reglas de educación, experiencia, alternativas
y equivalencias**, y se quiere hacer de forma **interactiva**, no con una
charla pasiva.

La solución: una aplicación web tipo *quiz* en vivo (estilo Kahoot) donde:

- El capacitador **expone un criterio** (por ejemplo, educación) y activa una
  pregunta en tiempo real.
- Las 66 personas **entran una sola vez escaneando un código QR**, se
  registran con su nombre y responden desde su celular.
- Cada pregunta tiene **3 minutos**; quien no responde a tiempo obtiene
  **0 puntos** (se considera que no le alcanzó el tiempo).
- Al responder, cada persona ve **de inmediato cómo le fue** con una carita
  (feliz, enojada, triste, llorando) y su puntaje.
- Al cerrar la pregunta, la pantalla proyectada muestra los **resultados** y
  el **ranking de la primera a la última posición** — con espíritu de juego,
  para que se vea la participación sin que nadie se sienta mal.
- Pregunta a pregunta se lleva un **acumulado**: quién subió puestos, quién
  bajó (▲/▼).
- El capacitador puede hacer un **sorteo aleatorio**: la aplicación elige a
  una persona al azar y muestra su pregunta, su respuesta y cómo le fue —
  útil para pedirle que sustente o para premiar.
- Todo debe ser **liviano**: las 66 personas entran al tiempo sin que se
  caiga ni se ponga lenta.

## 2. Lo que ya está construido

La aplicación está **terminada, probada y funcionando**. Código fuente:
<https://github.com/jade1010020668/2026RE104081>
(rama `claude/vrm-assessment-app-hr4055`).

### Las tres vistas

| Vista | URL | Quién la usa | Qué hace |
|---|---|---|---|
| **Participante** | `/` | Las 66 personas (celular) | Es la URL del QR. Se entra **una sola vez** con el nombre; sobre ese ingreso se juegan todas las preguntas. Muestra la pregunta con botones de colores, la carita y puntaje al responder, la posición y los primeros lugares. Si se cae la conexión o cierran el navegador, al volver entran automáticamente con su mismo puntaje. |
| **Supervisor** | `/admin` | Solo el capacitador (requiere código) | La "cabina de mando": activa las preguntas una a una, las cierra antes de tiempo si quiere, decide qué se ve en la pantalla proyectada, hace el sorteo, ve en vivo quién ha respondido, retira participantes, **crea/edita/elimina preguntas** y reinicia la sesión para otra jornada. |
| **Pantalla** | `/pantalla` | El video beam (requiere código) | Lo que ve el salón: portada con el **QR gigante** y los nombres entrando; la pregunta con el conteo regresivo; los resultados (respuesta correcta, distribución por opción, resumen de caritas, top de los más rápidos); la **tabla general** acumulada con ▲/▼; y el sorteo con animación de ruleta. |

### Reglas del juego implementadas

- **Tiempo**: 3 minutos por pregunta (configurable por pregunta, 10–600 s).
  El reloj lo controla el **servidor**: las respuestas tardías se rechazan
  aunque el celular tenga el reloj desajustado. La pregunta también se cierra
  sola si todos los conectados ya respondieron, o si el supervisor la cierra.
- **Puntuación**: respuesta correcta = **500 a 1000 puntos** según rapidez
  (`500 + 500 × tiempo restante / tiempo total`). Incorrecta o sin
  responder = **0 puntos**. Desempate: menor tiempo acumulado.
- **Caritas por pregunta**:

  | Carita | Significado |
  |---|---|
  | 😄 Feliz | Correcta y rápida (primera mitad del tiempo) |
  | 😠 Enojada | Correcta pero lenta (segunda mitad) |
  | 😢 Triste | Incorrecta |
  | 😭 Llorando | No respondió — tiempo agotado (0 puntos) |

- **Ranking por pregunta**: ordenado por puntaje y rapidez, con distribución
  de respuestas por opción (cuántos marcaron A, B, C, D) y conteo de caritas.
- **Tabla general acumulada**: de la posición 1 a la 66, con la flecha de
  cuántos puestos subió (▲) o bajó (▼) cada quien frente a la pregunta
  anterior, y sus caritas pregunta a pregunta.
- **Sorteo**: elige una persona al azar con animación, y muestra su puesto,
  puntos, su respuesta a la última pregunta y cómo le fue.

### Banco de preguntas

- Vive en `data/questions.json` y también se administra desde `/admin`
  (crear, editar, eliminar; las preguntas ya jugadas quedan bloqueadas).
- Cada pregunta: enunciado, 2 a 6 opciones, una correcta, tiempo propio.
- Incluye **10 preguntas de ejemplo del día 1: criterios de educación en la
  VRM** (diploma vs. acta de grado, terminación de materias, tarjeta
  profesional, convalidación de títulos del exterior, educación formal vs.
  diplomados, equivalencias del Decreto 1083 de 2015, NBC, nivel de
  formación, fecha de acreditación de requisitos). **Deben revisarse con el
  equipo antes del evento** — son un punto de partida, no contenido oficial.
- Para las siguientes jornadas (experiencia, alternativas, equivalencias) se
  reinicia la sesión desde `/admin` y se carga o escribe el nuevo banco.

## 3. Cómo se usa (guion de una jornada)

1. Conectar un computador al video beam y al WiFi del salón. Ejecutar la
   aplicación (`npm start`) y proyectar `/pantalla` (portada con QR).
2. Las personas escanean el QR **una sola vez**, escriben su nombre y quedan
   en sala de espera; sus nombres aparecen en la pantalla.
3. El capacitador expone el criterio del día y, cuando anuncia la pregunta
   ("¿tienen 3 minutos?"), pulsa **Activar siguiente pregunta** en `/admin`.
4. Todos responden desde el celular; el supervisor ve el avance (12/66…).
5. Al cerrarse la pregunta, la pantalla muestra los resultados; cada persona
   ve su carita, puntos y puesto en su celular.
6. El supervisor alterna en pantalla: **Resultados → Tabla general →
   Sorteo** (pide a la persona sorteada que comente su respuesta).
7. Se repite desde el paso 3 con la siguiente pregunta; el acumulado y las
   subidas/bajadas de posición se calculan solos.
8. Al final de la jornada: **Reiniciar sesión** deja todo listo para el
   siguiente día (las preguntas se conservan; participantes y puntajes se
   borran).

## 4. La técnica (resumen)

- **Servidor**: Node.js + Express + Socket.IO (WebSockets). Tiempo real de
  verdad: cada cambio se difunde al instante a las tres vistas.
- **Frontend**: HTML/CSS/JS puro, sin frameworks — páginas livianísimas que
  abren rápido en cualquier celular. 66 usuarios simultáneos es una carga
  muy holgada para este diseño.
- **QR**: se genera en el servidor con la URL real de la aplicación
  (IP local o dominio público), sin configurar nada.
- **Persistencia**: la sesión se guarda en `data/session.json`; si el
  servidor se reinicia a mitad de jornada, retoma donde iba.
- **Reconexión**: el celular guarda un token; al volver a abrir el enlace la
  persona recupera su nombre y puntaje.
- **Seguridad básica**: `/admin` y `/pantalla` requieren código
  (`ADMIN_CODE`); nombres sanitizados; validación de respuestas en el
  servidor (una sola respuesta, dentro del tiempo, opción válida).
- **Puerto**: si el 3000 está ocupado por otra aplicación, busca solo el
  siguiente libre (3001, 3002…).

Estructura del repositorio:

```
server.js            Servidor web + tiempo real + QR + persistencia
lib/game.js          Reglas del juego (puntuación, caritas, rankings, sorteo)
data/questions.json  Banco de preguntas (editable)
public/              Las tres vistas (index, admin, pantalla) + estilos
scripts/demo.js      npm run demo: arranca y abre las 3 ventanas solas
scripts/smoke-test.js  Prueba automática de punta a punta
Dockerfile           Despliegue en Hugging Face Spaces / contenedores
render.yaml          Despliegue con un clic en Render
```

### Configuración (variables de entorno)

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `ADMIN_CODE` | `cnsc2026` | Código del supervisor y la pantalla — **cambiarlo antes del evento** |
| `PUBLIC_URL` | *(automática)* | URL que codifica el QR si hay dominio propio |
| `SHOW_RESULT_ON_ANSWER` | `true` | En `false`, la carita solo se revela al cerrar la pregunta (evita soplos) |
| `AUTO_CLOSE` | `true` | Cierra antes de tiempo si ya todos respondieron |

### Pruebas realizadas

- **Prueba automática** (`npm run smoke`): 22 verificaciones — ingreso,
  nombres duplicados, puntuación por rapidez, caritas, cierre por tiempo,
  ranking, reconexión con token, sorteo, pantalla y QR. Todas en verde.
- **Prueba visual en navegador real**: flujo completo con 4–5 participantes
  simulados, dos rondas de preguntas, verificando QR, temporizador,
  resultados, tabla con ▲/▼ y sorteo.
- **Demo interactiva publicada** (simulación de las tres vistas con
  participantes de prueba, para verla sin instalar nada):
  <https://claude.ai/code/artifact/e1827674-eb5f-48cb-b43f-35165b7d4535>

## 5. Cómo ejecutarla

**En un computador (para el salón, con WiFi local):**

```bash
git clone https://github.com/jade1010020668/2026RE104081.git
cd 2026RE104081
npm install
npm run demo     # arranca y abre solas las 3 ventanas (o: npm start)
```

**En internet (URL pública):** el proyecto ya está preparado para
**Hugging Face Spaces** (con el `Dockerfile`) y para **Render** (con
`render.yaml`). Pasos detallados en el `README.md`, sección "Publicar en
internet".

## 6. Estado actual y pendientes

- [x] Aplicación completa (tres vistas, reglas, sorteo, acumulado, QR)
- [x] Banco de ejemplo del día 1 (educación) — **pendiente revisión de
      contenido por el equipo VRM**
- [x] Pruebas automáticas y visuales en verde
- [x] Código en GitHub
- [x] Preparación para despliegue (Dockerfile, render.yaml, guía)
- [ ] **Subir los archivos al Space** `MORALES101002/quiz-vrm` de Hugging
      Face (está creado pero vacío y con SDK "gradio"; al subir el proyecto
      con su README se corrige solo a "docker"). Opciones: 3 comandos de git
      con un token Write, subir por el navegador, o compartir un token
      temporal para que el asistente lo haga y luego revocarlo.
- [ ] Definir el `ADMIN_CODE` definitivo como secreto del Space
- [ ] Probar la URL pública con celulares reales antes del evento
- [ ] Cargar los bancos de preguntas de las siguientes jornadas
      (experiencia, alternativas y equivalencias)

## 7. Ideas futuras (no implementadas)

- Exportar los resultados de la jornada a **Excel/CSV** (asistencia,
  puntajes por pregunta, ranking final) como evidencia de la capacitación.
- Varios bancos de preguntas precargados con selector de "jornada".
- Modo **equipos** (grupos que suman puntos).
- Estadísticas por pregunta para el capacitador (¿cuál criterio costó más?)
  al final de la sesión.
- Certificado o constancia automática de participación.

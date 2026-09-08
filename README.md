# Sala de Constelaciones

Plataforma web para hacer **constelaciones familiares a distancia** en una sala 3D compartida.
El constelador abre una sesión, comparte un código de 6 caracteres y el consultante entra a la
misma sala. Los dos tienen **exactamente los mismos permisos** para colocar, mover y girar
representantes, pero cada uno mira desde su propia cámara — y cualquiera puede pedir ver la
sala desde la perspectiva del otro.

## Cómo se levanta

```bash
npm run install:all
```

```bash
npm run dev
```

- Cliente: http://localhost:5173
- Servidor de sesiones: http://localhost:4000

Para producción: `npm run build` genera `client/dist` y `npm start` lo sirve desde el mismo
origen que el servidor de sesiones (http://localhost:4000).

> La videollamada usa `getUserMedia`, que los navegadores sólo habilitan en `localhost` o bajo
> **HTTPS**. Al publicarlo hay que servirlo con certificado.

## Cómo se usa

1. El constelador entra, pone su nombre y toca **Crear sesión**. Recibe un código (por ejemplo
   `QNFNQT`) y el botón *Copiar invitación* arma un enlace con el código incluido.
2. El consultante abre ese enlace o escribe el código y toca **Entrar**.
3. Cualquiera de los dos elige un rol del panel izquierdo y hace clic en el piso para colocarlo
   (o toca `+` para que entre solo, en un anillo alrededor del centro).
4. Se arrastra la figura para moverla y se usa el **aro blanco** para girarla. La flecha del piso
   y la nariz de la figura indican siempre hacia dónde mira.

### Controles de la sala

| Acción | Cómo |
| --- | --- |
| Caminar | `W` `A` `S` `D` o flechas |
| Mirar alrededor | arrastrar con el mouse sobre el piso o la pared (un dedo en el celular) |
| Acercarse / alejarse | `,` / `.`, los botones `+` y `−` de la esquina, la rueda del mouse o pellizcar con dos dedos |
| Subir / bajar la vista | `Espacio` / `Z` |
| Moverse más rápido | `Shift` |
| Mover una figura | arrastrarla |
| Girar una figura | arrastrar el aro blanco, o `Q` / `E` (15°; con `Shift`, 5°) |
| Mirar desde una figura | doble clic sobre ella, o el botón `◉` de la lista |
| Quitar una figura | `Supr` con la figura seleccionada |
| Deseleccionar | `Esc` o clic en el piso |
| Salir de la sala | botón **Salir** de la barra superior |

Las teclas `,` y `.` y los botones de la esquina hacen lo mismo que la rueda: acercan y alejan
sobre la línea de la mirada. Mantenerlos apretados sigue acercando. Mientras se mira desde una
figura o desde la otra persona quedan inactivos, porque ahí la posición no es propia.

**Salir** devuelve al menú principal sin cerrar la sala: la otra persona sigue adentro, la
constelación queda en el servidor y con el mismo código se vuelve a entrar.

### Vistas

- **Vista general** y **Vista cenital** (desde arriba, para leer las direcciones de las miradas).
- **Ver desde una figura**: la cámara se para en el lugar del representante, a la altura de sus
  ojos y mirando hacia donde él mira.
- **Ver la vista de la otra persona**: en la barra superior, tocar el nombre del otro
  participante. La cámara se acopla a la suya hasta tocar *volver a mi vista*. Está disponible
  para los dos, no sólo para el constelador.
- Mientras cada uno mira por su cuenta, un marcador flotante muestra dónde está parado el otro
  y hacia dónde mira.

### Panel lateral

- **Representantes**: catálogo completo por ramas — núcleo, ascendientes (hasta tatarabuelos),
  colaterales, descendientes, vínculos (pareja, ex, amistades, familia adoptiva) y elementos
  sistémicos (síntoma, excluido, recurso, dinero, destino, muerte…).
- **Sesión**: guardar *momentos* de la constelación y restaurarlos para ambos, mostrar u ocultar
  nombres y grilla, y vaciar la sala.
- **Mis constelaciones**: archivo personal de quien tenga la cuenta (ver abajo).
- **Chat** de texto, con contador de mensajes sin leer.

## Cuentas y constelaciones guardadas

La cuenta es **opcional**: sin registrarse se puede constelar igual, sólo que al
cerrar la sala no queda nada guardado. Con cuenta, cada persona tiene su propio
archivo:

- Se crea desde el vestíbulo o desde la pestaña **Sesión** dentro de la sala.
- **Guardar** archiva la sala como está: posiciones, giros, nombres, notas y todos
  los momentos guardados.
- Desde el vestíbulo, **Abrir en una sala** crea una sesión nueva ya armada con esa
  constelación, lista para pasarle el código al consultante.
- Dentro de la sala, **traer** reemplaza lo que hay por una constelación guardada,
  y el cambio lo ven los dos al instante.
- Cada archivo es privado: el consultante no ve las constelaciones del constelador
  ni al revés, aunque compartan la sala. Quien quiera guardarse la sesión la guarda
  en su propia cuenta.

Las contraseñas se guardan con `scrypt` y sal por usuario; la sesión iniciada viaja
en un token firmado que vale 30 días.

### Dónde se guardan los datos

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a Postgres. **Es la que hay que poner en producción**: las cuentas sobreviven a reinicios y redespliegues. Sirve cualquier Postgres gestionado (Neon, Supabase, Render). |
| `AUTH_SECRET` | Clave con la que se firman las sesiones iniciadas. Si no está, el servidor genera una y la guarda junto a los datos. |
| `DATA_DIR` | Sólo sin `DATABASE_URL`: carpeta del archivo JSON de respaldo (por defecto `.data/`). |

Sin `DATABASE_URL` todo va a un archivo JSON local. Alcanza para desarrollo, pero en
un hosting de disco efímero —como el plan gratuito de Render— ese archivo se borra en
cada redespliegue y las cuentas se pierden. Las tablas se crean solas la primera vez.

### En el celular

La sala funciona con la pantalla en vertical:

- El panel lateral arranca cerrado y ocupa el ancho completo al abrirlo. Al elegir un rol se
  cierra solo, para poder tocar el piso; el aviso de *colocando* queda flotando arriba.
- El inspector de la figura seleccionada pasa a ser una ficha al pie, de 40 % de la pantalla
  como máximo y con los campos en una columna. Los botones de acercar se corren por encima.
- La barra superior se parte en varias filas: su alto se publica como la variable CSS
  `--topbar-h` y el panel y la videollamada arrancan justo debajo, sin superponerse.
- Los campos de texto usan 16 px, que es el mínimo con el que Safari en iPhone no agranda la
  página al enfocarlos.

### Videollamada

La pestaña **Videollamada** arriba a la derecha abre una llamada 1 a 1 por WebRTC. El servidor
sólo hace de señalizador: el audio y el video viajan directo entre los dos navegadores.
Incluye silenciar micrófono, apagar cámara y cortar.

Los servidores ICE los define el servidor en `/api/ice`. Por defecto usa STUN público, que
alcanza en la mayoría de las redes domésticas. Detrás de un NAT simétrico (varias redes móviles
y de oficina) la llamada no conecta y hace falta un **TURN**, que se configura por variables de
entorno sin tocar código:

| Variable | Ejemplo |
| --- | --- |
| `TURN_URL` | `turn:mi-turn.com:3478` (se aceptan varias separadas por coma) |
| `TURN_USERNAME` | usuario del TURN |
| `TURN_PASSWORD` | contraseña del TURN |

## Publicarla

### Vercel no sirve para esta app

Vercel corre funciones *serverless*: procesos cortos que arrancan con cada pedido y se apagan.
Esta app necesita un proceso **siempre vivo** que sostenga las conexiones WebSocket de la sala
(la sincronización de figuras, la perspectiva compartida y la señalización de la videollamada
viajan por ahí). En Vercel esas conexiones se cortan, así que la sala nunca sincroniza.

### Render (recomendado, tiene plan gratuito)

El repo ya trae [`render.yaml`](render.yaml). Un solo servicio sirve el cliente compilado y el
servidor de sesiones, así que no hay que configurar CORS ni dos dominios.

1. Crear un repositorio vacío en GitHub (sin README ni licencia) y conectarlo:

   ```bash
   git remote add origin https://github.com/USUARIO/REPO.git; git push -u origin main
   ```

2. En [render.com](https://render.com) → **New → Web Service** → conectar ese repositorio.
   Render lee el `render.yaml` solo; si lo cargás a mano:
   - Build Command: `npm run build:deploy`
   - Start Command: `npm start`
3. Queda publicado en `https://<tu-servicio>.onrender.com`, con HTTPS incluido — que es
   condición para que el navegador habilite la cámara y el micrófono.
4. Cada `git push` a `main` republica la app sola.

En el plan gratuito el servicio se duerme tras un rato sin uso: la primera visita tarda unos
30 segundos en despertar, y **al dormirse se pierden las sesiones abiertas**. Para sesiones
reales conviene el plan pago o persistir las sesiones en una base.

Para que las **cuentas** no se pierdan hay que darle una base de datos: crear un Postgres
gratuito (por ejemplo en [neon.tech](https://neon.tech)) y pegar su cadena de conexión en
Render → *Environment* → **DATABASE_URL**. El servidor crea las tablas solo al arrancar.

Railway y Fly.io funcionan igual de bien con los mismos dos comandos.

### Probarla hoy sin publicar nada

Para una prueba con otra persona, alcanza con exponer la máquina propia por un túnel HTTPS.
Los comandos van en sintaxis de PowerShell, que no acepta `&&` (en bash sería `npm run build &&
npm start`):

```bash
npm run build; if ($?) { npm start }
```

y en otra terminal:

```bash
npm run tunel
```

Eso imprime una URL `https://algo.trycloudflare.com` que se le pasa a la otra persona. Funciona
mientras la terminal siga abierta y la computadora prendida.

## Estructura

```
server/index.js      Express + Socket.IO: sesiones, sincronización y señalización WebRTC
server/api.js        Rutas HTTP de cuentas y de constelaciones guardadas
server/auth.js       Contraseñas (scrypt) y tokens de sesión firmados
server/storage.js    Capa de datos: Postgres si hay DATABASE_URL, archivo JSON si no
shared/roles.js      Catálogo de roles compartido entre cliente y servidor
client/src/scene/    Sala 3D (react-three-fiber): cámara, figuras, presencia del otro
client/src/ui/       Lobby, barra superior, panel lateral, inspector, videollamada, cuenta
client/src/net.js    Cliente de Socket.IO y acciones de red
client/src/api.js    Llamadas a la API de cuentas
client/src/store.js  Estado global (zustand)
```

### Cómo se sincroniza

Todo el estado de la sala vive en memoria en el servidor, indexado por código de sesión.
Los movimientos se emiten con *last-write-wins* y un limitador de ~45 ms durante el arrastre,
más un valor definitivo al soltar. Las cámaras se transmiten a ~11 Hz, que es lo que permite
ver la perspectiva del otro sin saturar la conexión.

## Pendientes conocidos

- Las **salas en vivo** viven en memoria: si se reinicia el servidor se pierden (se descartan
  solas a las 12 h sin actividad). Las constelaciones guardadas en una cuenta sí persisten,
  siempre que haya `DATABASE_URL`.
- No hay recuperación de contraseña por correo: si alguien la olvida, hay que reasignarla a
  mano en la base.
- La videollamada usa sólo STUN público. En redes con NAT simétrico hace falta un servidor TURN
  propio; se agrega en la lista `iceServers` de `client/src/ui/VideoDock.jsx`.
- Está pensada para dos participantes. El modelo del servidor admite más, pero la videollamada
  y el selector de perspectiva asumen una sola contraparte.
- La sala en sí no pide cuenta: quien tenga el código entra. La cuenta sólo gobierna el archivo
  personal de constelaciones guardadas.

# Crafty Controller

Siga y controle desde Gladys sus **servidores Minecraft** gestionados por
[Crafty Controller](https://craftycontrol.com): si cada uno está en marcha,
cuántos jugadores hay y quiénes, su CPU y su memoria, su versión. Gladys puede
reaccionar cuando un jugador llega o se va, cuando un servidor se vacía o se
llena, se detiene de forma inesperada o se reinicia — y arrancar, detener,
reiniciar o hacer una copia de un servidor desde una escena o el panel.

La integración habla con la API REST de Crafty 4 en su red, con un token de
API. No hay nada que instalar en los servidores. No está afiliada a Crafty
Controller ni a Mojang.

Sin Crafty, la integración
[Servidores de juego (GameDig)](https://github.com/guim31/gladys-gamedig)
(`gladys-gamedig`) lee un servidor Minecraft (y 300 juegos más) como la
lista de servidores del juego, y
[Minecraft Server](https://github.com/guim31/gladys-minecraft) lo lee por
RCON.

> **Probada con un Crafty Controller 4.11 real** (un servidor Paper 1.21.4,
> jugadores reales conectados, un fallo y una parada limpia), pero todavía no
> dentro de un Gladys real: sus comentarios son bienvenidos. Si algo no
> funciona como se describe, dígalo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-crafty/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Crafty Controller 4 (comprobado con la 4.11), accesible desde Gladys: por
  defecto `https://<dirección de Crafty>:8443`.
- Un **token de API** de Crafty:
  1. en Crafty, abra **Configuración del panel → Usuarios**, edite su usuario
     (o un usuario creado para Gladys) y luego la pestaña **Claves API**;
  2. cree una clave: un nombre (`gladys`) y **Acceso completo** (o, para una
     clave limitada a algunos derechos: _Comandos_ para arrancar, detener,
     reiniciar y hacer copias, _Registros_ para distinguir un fallo de una
     parada limpia);
  3. pulse **Conseguir un Token** y copie el texto largo que aparece.

El token actúa con los derechos de su usuario: un usuario que solo ve algunos
servidores da un token que solo ve esos.

## Instalación

1. Instale la integración: **Integraciones → Instalar desde GitHub**,
   dirección `https://github.com/guim31/gladys-crafty`.
2. En su configuración:
   - **Dirección de Crafty**: la dirección con la que abre Crafty, p. ej.
     `https://192.168.1.10:8443`. Una dirección IP sola recibe `https://` y el
     puerto 8443.
   - **Token de API**: el token copiado antes.
   - **Aceptar certificados autofirmados**: marcado por defecto, ya que Crafty
     sirve su HTTPS con su propio certificado. Desmárquelo solo si el suyo es
     de confianza.
   - **Permitir detener y reiniciar**: desactivado por defecto. Detener o
     reiniciar un servidor expulsa a sus jugadores: márquelo para permitirlo
     desde las escenas y el widget.
   - **Intervalo de actualización**: 30 segundos por defecto (Crafty mide sus
     servidores cada 30 segundos).
   - **Idioma de los nombres**: de las funciones (fijado al añadir un
     dispositivo) y de los textos que escribe la integración.
3. Pulse **Probar la conexión**: enumera los servidores que da Crafty.
4. En **Descubrimiento**, añada como dispositivos los servidores que quiera.

## El dispositivo de cada servidor

Un dispositivo por servidor de Crafty, con su nombre, conservado si se
renombra:

| Función                  | Valor                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| **En marcha**            | 1 mientras el servidor funciona en Crafty, 0 cuando está detenido |
| **Jugadores conectados** | jugadores conectados (0 cuando el servidor está detenido)         |
| **Plazas**               | número máximo de jugadores, una vez dado por el servidor          |
| **Jugadores**            | quién juega, p. ej. `Alice, Bob`; «Nadie»; «Servidor detenido»    |
| **CPU**                  | uso de CPU del proceso del servidor, en %                         |
| **Memoria**              | memoria usada por el proceso del servidor, en MB                  |
| **Versión**              | p. ej. `Paper 1.21.4`, una vez dada por el servidor               |

Las funciones de jugadores solo existen para los servidores cuyos jugadores
cuenta Crafty (Minecraft Java y Bedrock). Minecraft da 12 nombres como
máximo: más allá, el texto añade «y N más».

## Panel

El widget **Servidores Crafty** muestra una casilla por servidor (jugadores
conectados / plazas, o su estado: detenido, caído, arrancando), una lista con
el estado, la versión y quién juega, y botones, cada uno con confirmación
previa:

- **Arrancar** para un servidor detenido;
- **Reiniciar** y **Detener**, solo si se permiten en la configuración;
- **Copia** cuando el widget muestra un solo servidor;
- **Actualizar**.

Todos los servidores por defecto (tres como máximo), o el elegido en la
configuración del widget: un solo servidor muestra también su CPU y su
memoria.

## Escenas

### Disparadores

- **Un jugador se ha unido al servidor Minecraft** — con el nombre cuando
  Minecraft da todos los nombres. Filtros: servidor, nombre del jugador.
- **Un jugador ha salido del servidor Minecraft** — con los minutos jugados.
  No se activa cuando el servidor se detiene.
- **El servidor Minecraft está vacío** — el último jugador se ha ido y el
  servidor sigue en marcha.
- **El servidor Minecraft está lleno** — todas las plazas están ocupadas.
- **Un servidor se ha detenido de forma inesperada** — una parada no pedida ni
  por Gladys ni por Crafty: sin apagado limpio en el registro del servidor (la
  clave necesita el derecho _Registros_), o la detección de fallos de Crafty.
- **Un servidor se ha reiniciado** — de nuevo en marcha tras un reinicio
  (desde Gladys o Crafty) o una parada inesperada (variable «Tras una parada
  inesperada»).

Una parada o un arranque visto en Crafty es también la función **En marcha**
del dispositivo: una escena puede usarla directamente («En marcha» pasa a 0).

### Acciones

- **Arrancar un servidor Minecraft** — no se envía nada si ya está en marcha.
- **Detener un servidor Minecraft** y **Reiniciar un servidor Minecraft** —
  solo si se permite en la configuración; si no, la escena se detiene con un
  error.
- **Hacer copia de un servidor Minecraft** — lanza la copia por defecto del
  servidor en Crafty, con sus ajustes (una copia configurada para detener el
  servidor lo detiene).
- **Leer un servidor Minecraft** — lo lee ahora; su estado (en marcha,
  jugadores, CPU, memoria, versión) pasa a los pasos siguientes: un mensaje,
  o «Continuar solo si» sobre en marcha.

Los cuatro comandos dan «Comando enviado» (falso cuando no había nada que
hacer).

### Ideas de escenas

- A las 23:00 los días de colegio, si el servidor de los niños sigue en
  marcha: un mensaje y luego **Detener un servidor Minecraft**.
- **El servidor Minecraft está vacío** → **Hacer copia de un servidor
  Minecraft**.
- **Un servidor se ha detenido de forma inesperada** → una notificación y
  luego **Arrancar un servidor Minecraft**.
- **Un jugador se ha unido al servidor Minecraft** (jugador «Alice») →
  «Alice está en {{server}}».

## Solución de problemas

- **«Crafty inaccesible»**: compruebe la dirección y el puerto (8443 por
  defecto), y que Gladys alcanza la máquina de Crafty.
- **«Certificado rechazado»**: marque «Aceptar certificados autofirmados».
- **«Esta dirección no es la API de Crafty»**: normalmente `http://` en el
  puerto HTTPS: use `https://`.
- **«Token de API rechazado por Crafty»**: la clave se ha borrado o el token
  se ha copiado a medias: cree un nuevo token con **Conseguir un Token**.
- **«Falta un permiso para este token en Crafty»**: dé a la clave (o a su
  usuario) el derecho sobre el servidor: _Comandos_ para las acciones.
- **«Crafty responde, pero este token no ve ningún servidor»**: el usuario de
  la clave no tiene ningún servidor, o la clave no tiene derechos sobre ellos.
- **Ningún fallo detectado**: sin el derecho _Registros_, la integración no
  puede distinguir un fallo de una parada limpia; active la detección de
  fallos en Crafty o dé el derecho _Registros_ a la clave.
- Registros más detallados de la integración: `LOG_LEVEL=debug`.

## Límites

- Probada con un Crafty Controller 4.11 real, todavía no dentro de un Gladys
  real.
- Crafty mide sus servidores cada 30 segundos: un cambio aparece en 30 a 60
  segundos, un jugador que se queda menos puede pasar desapercibido.
- Minecraft da 12 nombres de jugadores como máximo: más allá, las llegadas y
  salidas no tienen nombre.
- Un reinicio más rápido que dos lecturas solo se ve por su nueva hora de
  arranque.
- Los demás servidores de Crafty (Steam, Hytale) tienen el estado en marcha,
  la CPU, la memoria y los comandos, sin jugadores.
- Un solo Crafty por integración.

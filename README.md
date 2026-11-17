# Amiibolink Studio

PWA gratuita y de código abierto para organizar volcados Amiibo NTAG215 y escribirlos por Bluetooth Low Energy en un Amiibolink Clásico con botón y LED. La biblioteca guarda archivos y metadatos en IndexedDB. Workbox precarga la aplicación, las fuentes y las 932 miniaturas del catálogo integrado.

## Compilar y probar

1. Instala Node.js 22.12 o posterior con npm.
2. Abre una terminal en la carpeta del proyecto y ejecuta:

   ```sh
   npm ci
   npm test
   npm run build
   npm run preview
   ```

3. Abre `http://localhost:4173` en Chrome o Edge de escritorio. Espera a que la cabecera indique **Lista para usar sin conexión**. Activa el modo sin red de DevTools y recarga la aplicación para comprobar la caché. Desactiva ese modo para ensayar la actualización opcional del catálogo.

`npm run dev` inicia Vite para desarrollar la interfaz. Usa el resultado de `npm run build` para probar el service worker.

## Usar en el teléfono o en escritorio

1. Abre la URL HTTPS publicada. En Chrome o Edge, el icono de descarga de la cabecera abre el diálogo de instalación cuando el navegador lo ofrece.
2. En iOS, abre esa misma URL dentro de [Bluefy](https://bluefy.app/) y concede el permiso de Bluetooth. Comprueba **Lista para usar sin conexión** y recarga sin red en Bluefy para verificar la caché de esa versión. En Safari puedes instalar la biblioteca para consultar tus archivos y el catálogo. La conexión BLE de iOS requiere abrir la app dentro de Bluefy.
3. Pulsa **Importar .bin / .zip** y elige archivos propios. Se admiten volcados NTAG215 de 532, 540 o 572 bytes, incluidos `.bin` en subcarpetas de un ZIP. Los duplicados se detectan por contenido. Cada archivo de la biblioteca se puede descargar en su tamaño original.
4. Activa el Amiibolink con su botón y pulsa **Conectar Amiibolink**. Selecciona el dispositivo en el diálogo del navegador.
5. En **Mi biblioteca**, pulsa **Cargar al Emulador**. El progreso llega al 100 % cuando se verifica el ACK final. Tras la escritura, escanea en la consola para comprobar el Amiibo. La sección **Consola BLE** muestra los envíos `TX` y las notificaciones `RX` en hexadecimal.
6. **Fijo** selecciona el modo de lectura y escritura para conservar el UID en firmware compatible. Selecciona este modo antes de cargar el volcado. **Manual** conserva el UID entre lecturas hasta pulsar el botón físico. **Auto-Random** lo cambia al escanear. El estado del modo se muestra después de recibir su ACK.

La primera visita requiere red para descargar y precargar la app. Los archivos importados se guardan por origen y perfil del navegador. Si cambias de navegador o de dominio, importa tus archivos en el nuevo origen. La duración de la caché depende de la política de almacenamiento del navegador y de si borras los datos del sitio. [Web Bluetooth en Chrome](https://developer.chrome.com/docs/capabilities/bluetooth), [Bluefy](https://bluefy.app/)

### Generar un UID en la app

En una tarjeta importada, pulsa el icono de huella y selecciona tu propio `key_retail.bin` de 160 bytes, con la clave `unfixed-info` seguida de `locked-secret`. El navegador verifica ambas firmas del original, genera el UID NXP, recalcula BCC0 y BCC1, vuelve a cifrar y firmar el volcado y guarda una copia de 540 bytes. Las claves se leen en memoria. El volcado de origen se conserva.

### Actualizar el catálogo

El catálogo integrado funciona desde la primera visita. **Actualizar catálogo** consulta `https://amiiboapi.org/api/amiibo/` y guarda en IndexedDB los metadatos y las imágenes nuevas que se descarguen. Las fichas anteriores conservan sus miniaturas locales. El endpoint original de `www.amiiboapi.com` devolvió HTTP 404 durante el desarrollo. [Fork activo de AmiiboAPI](https://github.com/8bitDream/AmiiboAPI)

## Publicar gratis por HTTPS

### GitHub Pages

1. Crea un repositorio público en GitHub y sube los archivos del proyecto a `main`, incluidas las carpetas `public` y `.github`. `.gitignore` excluye `node_modules` y `dist`.
2. En **Settings → Pages → Build and deployment → Source**, selecciona **GitHub Actions**.
3. En **Actions**, ejecuta **Publicar en GitHub Pages** mediante **Run workflow** si el primer push ocurrió antes de activar Pages. Los pushes posteriores a `main` ejecutan el flujo automáticamente.
4. Abre la URL del entorno `github-pages`. Para un repositorio de proyecto suele ser `https://TU_USUARIO.github.io/TU_REPO/`. La acción calcula `VITE_BASE` para los recursos, el manifiesto y el service worker. [Guía de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### Vercel

1. Sube el proyecto a un repositorio Git y elige **Add New → Project** en Vercel con el plan Hobby.
2. Importa el repositorio. Selecciona **Vite**, verifica que la carpeta raíz sea la del proyecto y elige Node.js 22.x o posterior.
3. Usa `npm ci` como comando de instalación, `npm run build` como comando de compilación y `dist` como directorio de salida. Deja `VITE_BASE` sin definir para servir desde `/`.
4. Pulsa **Deploy** y abre la URL HTTPS `vercel.app` desde el navegador del teléfono. [Guía de Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## Protocolo Clásico

El cliente solicita el dispositivo por prefijo `amiibolink` o por servicio Nordic UART (`6e400001…`). Se suscribe a `6e400003…` antes de escribir en `6e400002…`. Una transferencia envía las siguientes tramas en orden y espera el ACK correspondiente en cada paso.

| Etapa | TX | RX esperado |
| --- | --- | --- |
| Preparación | `A0 B0` | `B0 A0` |
| Longitud | `AC AC 00 04 00 00 02 1C` | `CA CA` |
| Confirmación de longitud | `AB AB 02 1C` | `BA BA` |
| 27 bloques, índice de 1 a 27 | `DD AA 00 14` + 20 bytes + índice de 16 bits BE | `AA DD` |
| Fin de datos | `BC BC` | `CB CB` |
| Grabación | `CC DD` | `DD CC` |

Un volcado de 532 bytes se rellena con ocho ceros para la transferencia. Uno de 572 bytes se recorta a 540. La trama de datos mide 26 bytes y se escribe como una unidad GATT. Si el adaptador rechaza el tamaño o falta un ACK, la operación se corta y la consola indica dónde se detuvo. Vuelve a conectar antes de reintentar.

Los comandos de modo V2 cifran `A1 B1 03` (lectura/escritura), `A1 B1 01` (Manual) y `A1 B1 04` (Auto-Random). Manual cambia el UID al pulsar el botón. La secuencia `A0 01` / `A0 03` del planteamiento inicial difiere de las capturas y del cliente público para el Clásico. El código aplica la secuencia de la tabla y verifica ACK en claro o envueltos en V2. La comprobación en esta entrega usa un periférico simulado. La compatibilidad del modo de lectura/escritura, la grabación en flash y el comportamiento NFC/LED requieren validación con el dispositivo físico. [Cliente WebBluetooth Clásico](https://github.com/DanTheMan827/amiibolink-amiloop-webbluetooth/blob/master/amiibolink.html), [capturas de Pixl.js](https://github.com/solosky/pixl.js/blob/main/docs/en/05%2B2-amiibolink_ble.md), [implementación de lectura/escritura en Pixl.js](https://github.com/solosky/pixl.js/blob/main/fw/application/src/app/amiibolink/scene/amiibolink_scene_main.c)

## Código

- `src/services/amiibolinkBleService.ts` gestiona la sesión, los ACK, el límite de espera y el progreso. `amiibolinkProtocol.ts` define el formato en el cable.
- `src/services/ntag215Utils.ts` normaliza y extrae el ID. `amiiboCrypto.ts` implementa la generación de UID con cifrado y firmas.
- `src/services/dbStorage.ts`, `catalog.ts` e `importFiles.ts` gestionan los datos locales y los lotes ZIP.
- `src/components/` contiene la UI. `vite.config.ts` define la PWA y la precarga offline.

Licencia [MIT](LICENSE). Los créditos y avisos de terceros están en [THIRD_PARTY.md](THIRD_PARTY.md).

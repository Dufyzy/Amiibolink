# Amiibolink Studio

PWA gratuita y de código abierto para organizar volcados Amiibo NTAG215 y escribirlos por Bluetooth Low Energy en un Amiibolink Clásico con botón y LED. La biblioteca guarda archivos y metadatos en IndexedDB. Workbox precarga la aplicación, las fuentes y el catálogo integrado de 932 fichas.

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
2. En iPhone y iPad, abre la URL HTTPS en Bluefy y concédele permiso de Bluetooth. Safari, Chrome y la PWA instalada desde Safari permiten usar la biblioteca, pero carecen de Web Bluetooth. Comprueba **Lista para usar sin conexión** en el navegador que usarás. [Guía de Bluefy](https://bluefy.app/guide.html), [Chrome para iPhone y iPad](https://support.google.com/chrome/answer/6362090?co=GENIE.Platform%3DiOS&hl=es), [estado en WebKit](https://bugs.webkit.org/show_bug.cgi?id=238049)
3. Pulsa **Importar .bin / .zip** y elige archivos propios. Se admiten volcados NTAG215 de 532, 540 o 572 bytes, incluidos `.bin` en subcarpetas de un ZIP. Los duplicados se detectan por contenido. Cada archivo de la biblioteca se puede descargar en su tamaño original.
4. Activa el Amiibolink con su botón y pulsa **Conectar Amiibolink**. Selecciona el dispositivo en el diálogo del navegador.
5. En **Mi biblioteca**, pulsa **Cargar al Emulador**. El progreso llega al 100 % cuando se verifica el ACK final. Tras la escritura, escanea en la consola para comprobar el Amiibo. La sección **Consola BLE** muestra los envíos `TX` y las notificaciones `RX` en hexadecimal.
6. **Fijo** selecciona el modo de lectura y escritura para conservar el UID en firmware compatible. Selecciona este modo antes de cargar el volcado. **Manual** conserva el UID entre lecturas hasta pulsar el botón físico. **Auto-Random** lo cambia al escanear. El estado del modo se muestra después de recibir su ACK.

La primera visita requiere red para descargar y precargar la app. Los archivos importados se guardan por origen y perfil del navegador. Si cambias de navegador o de dominio, importa tus archivos en el nuevo origen. La duración de la caché depende de la política de almacenamiento del navegador y de si borras los datos del sitio. [Web Bluetooth en Chrome](https://developer.chrome.com/docs/capabilities/bluetooth), [Bluefy](https://bluefy.app/)

Si Bluefy se queda en blanco al usar una IP local, abre primero la misma URL HTTPS en Safari para comprobar que carga sin alertas de certificado. Un certificado de pruebas emitido por una autoridad local requiere instalar su perfil en el iPhone y activar la confianza para SSL. Una URL HTTPS publicada con un certificado público permite omitir ese paso. Cuando la página ya abra en Bluefy, comprueba su permiso de **Bluetooth** en **Ajustes → Privacidad y seguridad**. [Confianza de certificados en iOS](https://support.apple.com/es-es/102390), [permisos del iPhone](https://support.apple.com/es-mx/guide/iphone/iph168c4bbd5/ios)

### Generar un UID en la app

En una tarjeta importada, pulsa el icono de huella y selecciona tu propio `key_retail.bin` de 160 bytes, con la clave `unfixed-info` seguida de `locked-secret`. El navegador verifica ambas firmas del original, genera el UID NXP, recalcula BCC0 y BCC1, vuelve a cifrar y firmar el volcado y guarda una copia de 540 bytes. Las claves se leen en memoria. El volcado de origen se conserva.

### Actualizar el catálogo

El catálogo integrado funciona sin conexión tras la primera visita. **Actualizar catálogo** consulta `https://amiiboapi.org/api/amiibo/` y guarda los metadatos en IndexedDB. Al instalar esta versión, la PWA elimina la caché de fotos de versiones anteriores al cerrar todas sus pestañas y abrirla nuevamente. [Fork activo de AmiiboAPI](https://github.com/8bitDream/AmiiboAPI)

## Publicar gratis por HTTPS

### GitHub Pages

1. Usa un repositorio público con GitHub Free o un repositorio público o privado con un plan compatible, como GitHub Pro. El sitio publicado es público aunque el repositorio de origen sea privado. [Disponibilidad de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. Sube los archivos a `main`, incluidas `public` y `.github`. En **Settings → Pages → Build and deployment → Source**, selecciona **GitHub Actions** para habilitar la publicación.
3. En **Actions**, abre **Publicar en GitHub Pages → Run workflow** si el primer push ocurrió antes de activar Pages. El paso `configure-pages` necesita un sitio Pages habilitado y permiso `pages: read`. El workflow ya declara ese permiso para el job de compilación. Los pushes posteriores a `main` ejecutan el flujo automáticamente. [Guía de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. Abre la URL del entorno `github-pages`. Para un repositorio de proyecto suele ser `https://TU_USUARIO.github.io/TU_REPO/`. La acción calcula `VITE_BASE` para los recursos, el manifiesto y el service worker.

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

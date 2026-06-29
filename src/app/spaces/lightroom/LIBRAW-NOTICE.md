# LibRaw / libraw-wasm — nota de licencia

El nodo Lightroom (Fase 1) decodifica RAW en el navegador mediante [libraw-wasm](https://github.com/ybouane/LibRaw-Wasm) (ISC), que enlaza **LibRaw** (LGPL-2.1 OR CDDL-1.0).

Antes de uso comercial en producción, revisar con legal:

- [LibRaw license](https://www.libraw.org/docs/API-LICENSE.html)
- Obligaciones LGPL si se distribuye el binario WASM modificado
- Compatibilidad con el modelo SaaS de Foldder (procesamiento 100 % local en cliente)

El RAW **no** se sube a servidores Foldder en Fase 1; solo se procesa en el dispositivo del usuario.

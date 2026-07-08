# Detección de logo y extracción de identidad — algoritmo genérico

Proceso universal para extraer el logo, la tipografía, la paleta y el universo visual de **cualquier** documento de marca, sin depender del tipo de contenido ni del sector. Escrito como pipeline reutilizable.

Principio raíz: **no se detecta lo que recurre, se detecta lo que se comporta como marca.** En cualquier corpus recurren muchos elementos que no son el logo (fondos, bandas, iconos, fotos de plantilla). La marca se define por su comportamiento, no por su apariencia interna.

---

## PARTE A — LOGO

### A0 · Atajo vectorial (categórico, antes de cualquier análisis)
Si el corpus contiene un gráfico vectorial —un SVG subido por el usuario, o vección embebida en un PDF— es un logo por construcción: nadie vectoriza contenido decorativo o fotográfico. Un vector de marca corona por encima de todo el sistema de puntuación. Si el usuario lo sube explícitamente, es evidencia máxima y no compite con nada.

Solo si no hay vección se pasa al análisis sobre rasterizado.

### A1 · Rasterización y cosecha de candidatos
Renderizar las páginas del documento a resolución de análisis. Cosechar regiones candidatas en dos frentes, porque un logo puede vivir de dos formas:
- **Como asset embebido:** imágenes incrustadas en el documento.
- **Como composición en la página:** muchos logos no existen como un único archivo embebido — se componen en el layout (un símbolo vectorial junto a un texto, o varias piezas ensambladas). Por eso hay que capturar también **regiones renderizadas** de las zonas estructurales (cabecera, pie, esquinas), no solo extraer XObjects. Un asset embebido suelto puede ser solo una parte del logo; la región renderizada captura el logo completo tal como se ve.

Todo lo cosechado es **candidato**, no logo. El filtrado viene después.

### A2 · Puntuación por comportamiento de marca
Cada candidato recibe un `brandBehaviorScore` = combinación ponderada de cuatro señales universales. Ninguna mira *qué representa* el gráfico:

1. **Invarianza** — aparece **idéntico** (misma firma perceptual, mismo tamaño relativo, mismo recorte) en múltiples apariciones. La clave es *idéntico*, no *parecido*: dos fotos de una misma sesión son parecidas; dos instancias del logo son idénticas píxel a píxel porque son el mismo asset colocado por plantilla. Firma por hash perceptual (pHash) con umbral de distancia.

2. **Posición estructural** — vive en el cromo del documento (cabecera, pie, esquinas), con **baja varianza de posición** entre apariciones. El contenido cambia de página a página; la marca ocupa siempre el mismo punto.

3. **Persistencia inter-documento** — aparece en documentos **distintos** del mismo corpus. Es la señal más fuerte contra el contenido: una foto o un gráfico suele vivir en un solo documento; la marca cruza todo el material (presentación, informe, catálogo). Requiere agrupar firmas a través de todo el corpus, no por documento.

4. **Subordinación de escala** — es **pequeña** respecto a la página. Un elemento que ocupa una fracción grande de la página es contenido, no marca. Esta señal es la que descarta bandas decorativas y fondos recurrentes, que pueden tener invarianza alta pero fallan por tamaño.

```
brandBehaviorScore = w1·invarianza + w2·posiciónEstructural
                   + w3·persistenciaInterDoc + w4·subordinación
```

Priorizar invarianza y persistencia inter-documento: son las dos que ningún elemento de contenido satisface simultáneamente. Descartar los candidatos bajo umbral — no se comportan como marca.

### A3 · Métricas visuales como DESEMPATE (nunca como filtro)
El número de colores, la entropía tonal, la densidad de trazo y la geometría de bordes **no deciden** qué es un logo — eso lo hace el comportamiento. Solo se usan para romper empates entre candidatos con `brandBehaviorScore` equivalente: entre dos elementos que se comportan como marca, el más plano y geométrico es más probablemente el logotipo que, por ejemplo, un icono de interfaz recurrente. Se colocan al final del pipeline para que el sistema no se rompa con logos que legítimamente son fotográficos, ilustrados o multicolores.

### A4 · Propio vs. terceros (emerge del mismo modelo, sin lógica aparte)
Los documentos de marca suelen incluir logos ajenos (clientes, partners, certificaciones), típicamente agrupados y de aparición única. Se ordenan solos:
- **Marca propia:** invarianza alta + posición estructural constante + persistencia inter-documento alta → score alto → logo principal.
- **Logo de tercero:** aparición única, agrupado con otros, sin posición fija, en un solo documento → invarianza y persistencia bajas → score bajo → secundario o descartado.

No hace falta una regla especial para terceros: el mismo modelo que descarta el contenido los ordena por debajo.

### A5 · Aislamiento y variantes
El candidato coronado se recorta a su bounding box limpio (trim sobre la máscara de contenido, sin arrastrar texto ni elementos vecinos). Aislamiento del fondo:
- Fondo plano → keying local por umbral (coste nulo).
- Fondo con gradiente o fotográfico → matting con modelo de segmentación.
Variantes de polaridad: si el corpus contiene el logo sobre fondos claros y oscuros, cosechar ambas; si solo una polaridad y el logo es monocromo, sintetizar la otra recoloreando la máscara. Salida en formato con transparencia.

### A6 · Coronación y vectorización
La detección solo **propone**; el usuario **corona** con una acción. La vectorización (servicio de trazado) se dispara **únicamente** en la transición a coronado — nunca sobre propuestas, nunca en lote, nunca durante el análisis. Idempotente por firma: el mismo logo no se vectoriza dos veces. Si ya había vector en el corpus (A0), se usa ese sin gastar la operación.

---

## PARTE B — TIPOGRAFÍA

### B1 · Lectura robusta de fuentes embebidas
Leer las fuentes por la vía que soporta **todos** los formatos de fuente incrustada, no solo los comunes. Los documentos incrustan fuentes de varios tipos, y algunos formatos representan cada glifo como un gráfico en lugar de una fuente con tabla de nombres estándar — una lectura ingenua los ignora. Además, parte de los diccionarios de fuente suele estar en streams comprimidos, invisibles a una lectura de bytes cruda. Usar un motor que descomprima los streams y lea el nombre base de cualquier tipo de fuente.

Normalizar: eliminar el prefijo de subconjunto (los caracteres antes del `+`), separar familia y peso/estilo, agrupar por familia.

### B2 · Jerarquía por contexto de uso
Distinguir primaria de secundaria por **dónde se usa** cada familia, no por frecuencia bruta:
- Familia dominante en titulares grandes / junto al logo → **primaria**.
- Familia dominante en cuerpo de texto → **secundaria**.
- Familias que solo aparecen en anexos, pies o de forma aislada → se ignoran o van a una lista de baja prioridad con opción de promover.

### B3 · Espécimen honesto
Renderizar el espécimen con la fuente real **solo si** se puede obtener: extrayendo el fichero embebido, o localizándola en un repositorio de fuentes libres, o si el usuario la sube. Si solo se tiene el nombre y la fuente no es accesible (p. ej. comercial), mostrar el nombre de la familia y ofrecer subirla — **nunca** renderizar un espécimen en una fuente de sustitución haciéndolo pasar por la real. Registrar la licencia y el origen de la fuente para el capítulo tipográfico del libro.

---

## PARTE C — PALETA

### C1 · Extracción sobre renders
Cuantizar color sobre las páginas renderizadas (no solo sobre operadores de dibujo, que producen ruido). Agregar por frecuencia y área a través de todo el corpus.

### C2 · Roles y limpieza
Excluir neutros de soporte: blancos y negros casi puros son tinta y fondo de documento, no color de marca — salvo que el análisis demuestre que son intencionales. Asignar roles heurísticos: dominante oscuro → primario/fondo; color saturado recurrente en elementos de énfasis → acento; etc. Presentar los roles en lenguaje limpio, nunca la jerga interna del extractor.

---

## PARTE D — UNIVERSO VISUAL

### D1 · Inventario y deduplicación
Extraer todas las imágenes de contenido del corpus. Deduplicar por firma perceptual — el mismo asset suele repetirse muchas veces, y cuenta como uno. Filtrar por tamaño mínimo para descartar iconos y microelementos.

### D2 · Clasificación por categoría
Clasificar las imágenes distintas y de tamaño relevante en las categorías del universo visual (personas, objetos, texturas, entornos, protagonistas, general) mediante un pase de visión, en lote. Por cada categoría, sintetizar una **regla** que describa el patrón (no una lista de las imágenes), e ilustrarla con las imágenes canónicas de esa categoría.

---

## INVARIANTES DEL PIPELINE (aplican a todo)

- **Proponer, no imponer:** todo extractor produce candidatos en estado propuesto; el usuario corona.
- **Una fuente de verdad:** todos los consumidores (checklist, panel, libro) leen del estado consolidado, nunca del output crudo del extractor.
- **Ninguna operación de pago antes de coronar:** vectorización, generación y refinado LLM solo tras confirmación del usuario, con idempotencia por firma.
- **Honestidad:** lo que no se puede determinar se muestra como hueco; nunca se inventa ni se falsea (ni tipografía sustituta, ni color forzado, ni logo dudoso auto-validado).

---

## TESTS (genéricos, sin fixture específico)

Construir el banco de pruebas con **varios** documentos de sectores distintos, y verificar la regla, no un caso:
- **Comportamiento gana a apariencia:** el candidato coronado es el de mayor `brandBehaviorScore`, no el más recurrente ni el más plano.
- **El contenido recurrente no corona:** una imagen grande (foto, ilustración, gráfico) repetida en varias páginas de un solo documento no corona — falla subordinación y persistencia inter-documento. Cubre cualquier tipo de contenido sin enumerarlo.
- **Vección corona directa:** un logo vectorial en el corpus corona por A0 sin puntuar comportamiento ni gastar vectorización.
- **Terceros por debajo:** un grupo de logos ajenos de aparición única no produce logo principal.
- **Persistencia inter-documento pesa:** el mismo logo en dos documentos del corpus puntúa más que uno presente en uno solo.
- **Fuentes de cualquier tipo:** un documento cuyas fuentes estén en formato de-glifo-como-gráfico y en streams comprimidos devuelve la familia correcta, no vacío.
- **Espécimen honesto:** una fuente no accesible muestra nombre + botón de subida, nunca un espécimen falseado.
- **Composición en render:** un logo que se compone en el layout (símbolo + texto por separado) se captura completo desde la región renderizada, no como una pieza suelta.

## CRITERIO DE ACEPTACIÓN
El pipeline extrae logo, tipografía, paleta y universo visual de cualquier documento de marca por **cómo se comporta cada elemento en el corpus**, no por lo que representa. Funciona sin cambios entre sectores. Ninguna regla del algoritmo nombra un tipo de contenido concreto, ningún umbral está ajustado a un caso particular, y ningún elemento de contenido asciende a logo.

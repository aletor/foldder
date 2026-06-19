export type AppLanguage = "es" | "en";

export const DEFAULT_LANGUAGE: AppLanguage = "es";
export const LANGUAGE_STORAGE_KEY = "foldder-language";

export const LANGUAGE_OPTIONS: Array<{ id: AppLanguage; label: string; shortLabel: string }> = [
  { id: "es", label: "Español", shortLabel: "ES" },
  { id: "en", label: "English", shortLabel: "EN" },
];

type TranslationMap = Record<string, string>;

export const FOLDDER_TRANSLATIONS_EN = {
  "Mensaje clave": "Key Message",
  "La IA ya no es impredecible.": "AI is no longer unpredictable.",
  "Hasta ahora, la IA generaba resultados visualmente atractivos, pero difíciles de controlar. Foldder cambia eso: puedes definir exactamente qué cambia, dónde y cómo, manteniendo coherencia en toda la pieza.":
    "Until now, AI produced visually appealing results that were hard to control. Foldder changes that: you can define exactly what changes, where, and how, while keeping the whole piece coherent.",
  "De resultados bonitos… a decisiones precisas.": "From pretty results to precise decisions.",
  "Propuesta de valor": "Value Proposition",
  "Un sistema continuo de trabajo": "A Continuous Work System",
  "Foldder no sustituye tu proceso. Lo organiza. Todo ocurre dentro del mismo entorno: ideación, generación, edición, iteración, maquetación y entrega.":
    "Foldder does not replace your process. It organizes it. Everything happens in the same environment: ideation, generation, editing, iteration, layout, and delivery.",
  "Sin saltos entre herramientas": "No jumping between tools",
  "Sin pérdida de contexto": "No loss of context",
  "Sin reconstrucciones manuales": "No manual reconstruction",
  "Con control en cada fase": "Control at every stage",
  "Diferencial real": "Real Differentiator",
  "Control que antes no existía": "Control That Did Not Exist Before",
  "Puedes intervenir una imagen o pieza en múltiples zonas, aplicar cambios distintos y resolver todo en una única generación coherente.":
    "You can edit an image or piece across multiple zones, apply different changes, and resolve everything in one coherent generation.",
  "Edición multi-zona": "Multi-zone editing",
  "Cambios simultáneos": "Simultaneous changes",
  "Iteraciones consistentes": "Consistent iterations",
  "Resultado final usable": "Usable final output",
  "Quién lo entiende": "Who Gets It",
  "Para quienes ya saben cómo se trabaja esto": "For People Who Already Know How This Work Gets Done",
  "Directores creativos": "Creative directors",
  "Diseñadores senior": "Senior designers",
  "Filmmakers": "Filmmakers",
  "Equipos que entregan a cliente": "Client delivery teams",
  "Posicionamiento": "Positioning",
  "Esto no es para experimentar. Es para trabajar.": "This Is Not for Experimenting. It Is for Working.",
  "No es generación automática": "Not automatic generation",
  "No es un playground de IA": "Not an AI playground",
  'No es para probar "a ver qué sale"': 'Not for testing "let us see what happens"',
  "Cierre": "Closing",
  "No cambia lo que haces. Cambia cómo lo controlas.": "It Does Not Change What You Do. It Changes How You Control It.",
  "Foldder no redefine la creatividad. La devuelve a un entorno donde todo está conectado y bajo tu control.":
    "Foldder does not redefine creativity. It brings it back into an environment where everything is connected and under your control.",
  "Por fin, todo en un solo sitio.": "Finally, everything in one place.",
  "Foldder reúne todo tu proceso creativo —de la idea a la entrega— sin cambiar de herramienta, sin perder contexto y sin improvisar resultados.":
    "Foldder brings your whole creative process together, from idea to delivery, without switching tools, losing context, or improvising results.",
  "La IA está integrada. Pero aquí decides tú.": "AI is integrated. But here, you decide.",
  "Ver cómo funciona": "See How It Works",
  "Acceder a demo": "Open Demo",
  "Alternativas de frase clave": "Key Line Alternatives",
  "Frase elegida: “La IA ya no decide por ti.”": "Chosen Line: “AI No Longer Decides for You.”",
  "La IA ya no decide por ti.": "AI no longer decides for you.",
  "Control total. Sin perder tiempo.": "Full control. No wasted time.",
  "Todo en un sitio. Y ahora, bajo control.": "Everything in one place. Now under control.",
  "Menos sorpresa. Más decisión.": "Less surprise. More decision.",
  "De generar… a dirigir.": "From generating to directing.",
  "Entrar": "Enter",
  "Google": "Google",
  "Cuenta": "Account",
  "Continuar con Google": "Continue with Google",
  "Elegir cuenta de Google": "Choose Google account",
  "Comprobando sesión...": "Checking session...",
  "Acceso": "Access",
  "Entrar con Google": "Sign in with Google",
  "Abre Foldder con tu cuenta para crear proyectos, guardar assets y mantener la memoria creativa de cada producción.":
    "Open Foldder with your account to create projects, save assets, and keep the creative memory of each production.",
  "Acceso seguro con Gmail": "Secure access with Gmail",
  "Estudio creativo con IA": "AI Creative Studio",
  "De la idea a la entrega, en un solo lugar.": "From idea to delivery, in one place.",
  "Foldder reúne guion, imagen, vídeo, diseño, edición y memoria de marca en un espacio visual para producir piezas completas con IA.":
    "Foldder brings script, image, video, design, editing, and brand memory into one visual space to produce complete pieces with AI.",
  "Entrar al estudio": "Enter the Studio",
  "Ver posibilidades": "See Possibilities",
  "Qué puedes crear": "What You Can Create",
  "Producción creativa completa, no outputs sueltos.": "Complete creative production, not isolated outputs.",
  "Para equipos que necesitan pasar rápido de concepto a material usable.":
    "For teams that need to move quickly from concept to usable material.",
  "Películas y piezas de vídeo": "Films and Video Pieces",
  "Guion, escenas, referencias, generación de vídeo, timeline, audio y subtítulos.":
    "Script, scenes, references, video generation, timeline, audio, and subtitles.",
  "Anuncios y campañas": "Ads and Campaigns",
  "Conceptos, claims, versiones, piezas visuales y entregables por canal.":
    "Concepts, claims, versions, visual pieces, and channel-specific deliverables.",
  "Diseño gráfico": "Graphic Design",
  "Composiciones, carteles, assets de marca, edición por zonas y exportaciones.":
    "Compositions, posters, brand assets, zone editing, and exports.",
  "Redes sociales": "Social Media",
  "Posts, carruseles, vídeos cortos, copies y adaptaciones por formato.":
    "Posts, carousels, short videos, copy, and format-specific adaptations.",
  "Guiones y contenido": "Scripts and Content",
  "Artículos, scripts, reescrituras, tono editorial y derivados.":
    "Articles, scripts, rewrites, editorial tone, and derivatives.",
  "Presentaciones y entregables": "Presentations and Deliverables",
  "Material final listo para cliente: imágenes, vídeos, PDF, slides y recursos.":
    "Client-ready final material: images, videos, PDFs, slides, and assets.",
  "Cómo funciona": "How It Works",
  "Un flujo visual para dirigir IA.": "A visual workflow for directing AI.",
  "Cada nodo conserva contexto. Cada asset queda dentro del proyecto. Cada iteración puede convertirse en una pieza final.":
    "Every node keeps context. Every asset stays inside the project. Every iteration can become a final piece.",
  "Idea": "Idea",
  "Empieza con un briefing, una referencia, un guion o una imagen.":
    "Start with a briefing, a reference, a script, or an image.",
  "Producción": "Production",
  "Conecta nodos para generar texto, imagen, vídeo, diseño y variantes.":
    "Connect nodes to generate text, image, video, design, and variants.",
  "Edición": "Editing",
  "Ajusta zonas, monta clips, subtitula, revisa y conserva contexto.":
    "Adjust zones, edit clips, subtitle, review, and preserve context.",
  "Entrega": "Delivery",
  "Exporta piezas finales y mantiene el aprendizaje dentro del proyecto.":
    "Export final pieces and keep learning inside the project.",
  "Menos salto entre herramientas. Más dirección.": "Less tool switching. More direction.",
  "Todo el proceso creativo en un único espacio visual.":
    "The whole creative process in one visual workspace.",
  "Más control sobre qué cambia, dónde cambia y cómo se entrega.":
    "More control over what changes, where it changes, and how it is delivered.",
  "Memoria de marca, referencias y contexto disponibles durante la producción.":
    "Brand memory, references, and context available throughout production.",
  "Convierte la IA generativa en producción real.": "Turn generative AI into real production.",
  "Abrir Foldder": "Open Foldder",

  "Nuevo proyecto": "New project",
  "Proyecto nuevo": "New project",
  "Tus proyectos": "Your Projects",
  "TUS PROJECTS": "YOUR PROJECTS",
  "Comenzar un proyecto nuevo": "Start a New Project",
  "COMENZAR UN NEW PROJECT": "START A NEW PROJECT",
  "Abre un proyecto guardado o crea uno nuevo para continuar.":
    "Open a saved project or create a new one to continue.",
  "Abre un Project Saved o crea uno nuevo para continuar.":
    "Open a saved project or create a new one to continue.",
  "Elige un proyecto para cargarlo en el lienzo.": "Choose a project to load it onto the canvas.",
  "Cargando listado de proyectos…": "Loading project list...",
  "Preparando datos…": "Preparing data...",
  "Abrir proyectos": "Open projects",
  "Espera a que termine el borrado": "Wait until deletion finishes",
  "Crear un proyecto nuevo (el lienzo actual no guardado se reemplaza; el actual se guarda solo cada minuto)":
    "Create a new project (the current unsaved canvas will be replaced; the current one only saves every minute)",
  "Elige un nombre. Se creará un lienzo vacío y se guardará en el servidor; a partir de ahí el proyecto se guardará solo cada minuto.":
    "Choose a name. An empty canvas will be created and saved on the server; from then on the project will save automatically every minute.",
  "Nombre del proyecto": "Project name",
  "Proyecto": "Project",
  "Proyectos": "Projects",
  "Proyecto seleccionado": "Selected project",
  "Aún no hay proyectos guardados.": "There are no saved projects yet.",
  "Cargando proyecto…": "Loading project...",
  "Guardado automático": "Autosave",
  "Sin guardar": "Unsaved",
  "Acción": "Action",
  "Acciones": "Actions",
  "Guardar": "Save",
  "Guardando...": "Saving...",
  "Guardado": "Saved",
  "Guardar como": "Save as",
  "Duplicar": "Duplicate",
  "Duplicar nodo": "Duplicate node",
  "Eliminar": "Delete",
  "Borrar": "Delete",
  "Eliminar ahora": "Delete now",
  "Eliminando...": "Deleting...",
  "Cancelar": "Cancel",
  "Aceptar": "Accept",
  "Crear": "Create",
  "Crear nodo": "Create node",
  "Cerrar": "Close",
  "Abrir": "Open",
  "Buscar": "Search",
  "Buscar archivo, carpeta o email": "Search file, folder, or email",
  "Buscar por título...": "Search by title...",
  "Buscar fuente o categoría": "Search font or category",
  "Buscar nodo": "Search node",
  "Código": "Code",
  "Este enlace requiere código de acceso": "This link requires an access code",
  "Actualizar": "Refresh",
  "Descargar": "Download",
  "Descargar seleccionados": "Download Selected",
  "Descargar todo": "Download All",
  "Exportar": "Export",
  "Importar": "Import",
  "Copiar": "Copy",
  "Pegar": "Paste",
  "Cortar": "Cut",
  "Deshacer": "Undo",
  "Rehacer": "Redo",
  "Ver": "View",
  "Editar": "Edit",
  "Configuración": "Settings",
  "Ajustes": "Settings",
  "Avanzado": "Advanced",
  "Opciones": "Options",
  "Estado": "Status",
  "Tipo": "Type",
  "Tamaño": "Size",
  "Peso": "Size",
  "Servicio": "Service",
  "Archivo": "File",
  "Archivos": "Files",
  "Archivos visibles": "Visible files",
  "Archivos sin asignar": "Unassigned files",
  "Carpeta": "Folder",
  "Carpetas": "Folders",
  "Nodos": "Nodes",
  "Nodo": "Node",
  "Lienzo": "Canvas",
  "Vista": "View",
  "Vista previa": "Preview",
  "Sin vista previa": "No preview",
  "Mostrar": "Show",
  "Ocultar": "Hide",
  "Seleccionado": "Selected",
  "Sin selección": "No selection",
  "Sin resultados": "No results",
  "Sin conexión": "No connection",
  "Conectado": "Connected",
  "Desconectado": "Disconnected",
  "Pendiente": "Pending",
  "Pendientes": "Pending",
  "Preparado": "Prepared",
  "Preparando": "Preparing",
  "Procesando": "Processing",
  "Completado": "Complete",
  "Error": "Error",
  "Reintentar": "Retry",
  "Reiniciar": "Reset",
  "Limpiar": "Clear",
  "Limpiar todo": "Clear all",
  "Seleccionar": "Select",
  "Seleccionar todo": "Select all",
  "Deseleccionar": "Deselect",
  "Bloquear": "Lock",
  "Desbloquear": "Unlock",
  "Idioma": "Language",
  "Español": "Spanish",
  "Inglés": "English",
  "Catalán": "Catalan",
  "Automático": "Automatic",
  "Auto": "Auto",
  "Manual": "Manual",
  "Sí": "Yes",
  "No": "No",
  "Vacío": "Empty",
  "Usuario": "User",
  "Perfil": "Profile",
  "Alta": "High",
  "Baja": "Low",
  "Débil": "Weak",
  "Media": "Medium",
  "Fuerte": "Strong",
  "Próximamente": "Coming soon",
  "Próximamente: pausar solo este nodo.": "Coming soon: pause only this node.",

  "Prompt": "Prompt",
  "Prompt local": "Local Prompt",
  "Prompt grafo": "Graph Prompt",
  "Prompt final": "Final Prompt",
  "Prompt completo": "Full Prompt",
  "Prompt visual": "Visual Prompt",
  "Negative prompt": "Negative Prompt",
  "Negative / exclusión": "Negative / Exclusion",
  "Ver prompt": "View Prompt",
  "Plan / prompt": "Plan / Prompt",
  "Texto": "Text",
  "Texto original": "Original Text",
  "Texto reescrito": "Rewritten Text",
  "Texto director": "Director Text",
  "Plantilla de escena": "Scene Template",
  "Insertar plantilla": "Insert Template",
  "Frases de cámara (prompt)": "Camera Phrases (Prompt)",
  "Refuerzos API": "API Reinforcements",
  "Cola API": "API Tail",
  "Animación (API)": "Animation (API)",
  "Cámara (preset API)": "Camera (API Preset)",
  "Completa la capa 7 (locks) del texto; el backend lo añade al final como exclusión.":
    "Complements layer 7 (locks) in the text; the backend adds it at the end as an exclusion.",
  "Opcional (inglés)…": "Optional (English)...",
  "Opcional (inglés)...": "Optional (English)...",
  "Sin cable al Prompt — usa prompt local o conecta un nodo.": "No Prompt cable: use the local prompt or connect a node.",
  "Inglés · 7 capas: 1 cámara → 2 sujeto/@Image → 3 acción+físicas → 4 entorno → 5 luz → 6 estilo → 7 locks (puedes acortar)":
    "English · 7 layers: 1 camera -> 2 subject/@Image -> 3 action+physics -> 4 environment -> 5 light -> 6 style -> 7 locks (you can shorten it)",
  "Esqueleto en 7 capas (inglés); el gestor añade luz/estilo/física y el preset de cámara al enviar. Puedes borrar líneas que no uses. No sustituye el preset API ni las frases rápidas de cámara.":
    "7-layer skeleton (English); the manager adds light/style/physics and the camera preset when sending. You can delete unused lines. It does not replace the API preset or quick camera phrases.",
  "Atajos que insertan una frase en inglés sobre cómo se mueve la cámara (distinto de la plantilla de escena y del bloque «Cámara (preset)» de la API).":
    "Shortcuts that insert an English camera movement phrase (separate from the scene template and the API Camera Preset block).",
  "El servidor concatena al final del prompt, en este orden: Animación → Cámara (preset) → Negative. La capa 1 sigue siendo la primera frase de tu texto principal.":
    "The server appends these at the end of the prompt, in this order: Animation -> Camera Preset -> Negative. Layer 1 is still the first sentence of your main text.",
  "Fragmento extra de movimiento; distinto del preset de cámara y de la capa 1 en el prompt.":
    "Extra movement fragment; separate from the camera preset and from layer 1 in the prompt.",
  "Etiqueta de movimiento que añade el backend; puedes combinarla con la capa 1 del prompt local.":
    "Motion tag added by the backend; you can combine it with layer 1 of the local prompt.",
  "Gen. audio": "Generate Audio",
  "Modelo": "Model",
  "Modelo IA": "AI Model",
  "Petición IA": "AI Request",
  "Petición IA [{titleLabel}]": "AI Request [{titleLabel}]",
  "Luz": "Light",
  "Estilo": "Style",
  "Física": "Physics",
  "Sin preset": "No preset",
  "Luz dorada (golden hour)": "Golden hour light",
  "Niebla volumétrica": "Volumetric fog",
  "Neón en lluvia": "Neon rain",
  "Estudio limpio": "Clean studio",
  "Contraluz / rim light": "Backlight / rim light",
  "Luz de luna": "Moonlight",
  "Interior oscuro": "Dark interior",
  "Hiperrealista": "Hyperrealistic",
  "Documental": "Documentary",
  "Sci-fi frío": "Cold sci-fi",
  "Cálido / indie": "Warm / indie",
  "Animación 3D": "3D Animation",
  "Simulación de tela": "Cloth simulation",
  "Fluidos / lluvia": "Fluids / rain",
  "Pelo / pelaje": "Hair / fur",
  "Colisiones / impacto": "Collisions / impact",
  "Gravedad explícita": "Explicit gravity",
  "Dolly adelante": "Dolly forward",
  "Travelling lateral": "Lateral tracking",
  "Grúa ascendente": "Rising crane",
  "Órbita 270°": "270° orbit",
  "Efecto vértigo": "Vertigo effect",
  "Plano y cámara": "Shot & Camera",
  "Sujeto": "Subject",
  "Entorno": "Environment",
  "Iluminación": "Lighting",
  "Locks": "Locks",
  "Director": "Director",
  "Generar": "Generate",
  "Generando...": "Generating...",
  "Generando…": "Generating...",
  "Regenerar": "Regenerate",
  "Regenerar vídeo": "Regenerate video",
  "Generar vídeo": "Generate video",
  "Generar seleccionados": "Generate selected",
  "Generar storyboard completo": "Generate full storyboard",
  "Crear storyboard": "Create storyboard",

  "Video Editor": "Video Editor",
  "Timeline editable": "Editable Timeline",
  "Timeline": "Timeline",
  "Medios": "Media",
  "Medios recibidos": "Received Media",
  "Todos": "All",
  "Vídeos": "Videos",
  "Video": "Video",
  "Vídeo": "Video",
  "VFX sobre vídeo": "VFX on Video",
  "Vídeo, referencia y máscara según el modo alpha.": "Video, reference, and mask according to the alpha mode.",
  "Resolución máxima": "Maximum Resolution",
  "Aún no hay un job activo": "There is no active job yet",
  "Configura vídeo + prompt o referencia y lanza arriba.": "Set up video + prompt or reference, then launch above.",
  "La generación falló. Revisa la consola o reintenta.": "The generation failed. Check the console or retry.",
  "Vídeo fuente": "Source Video",
  "Máscara alpha": "Alpha Mask",
  "Según modo select/custom": "Based on select/custom mode",
  "Un solo prompt. Conecta un nodo al handle": "One prompt. Connect a node to the handle",
  "Describe el efecto: iluminación, estilo, qué debe ocurrir en la escena…":
    "Describe the effect: lighting, style, what should happen in the scene...",
  "Imágenes": "Images",
  "Imagen": "Image",
  "Audio": "Audio",
  "Añadir": "Add",
  "Añadir otra vez": "Add Again",
  "Añadir en playhead": "Add at Playhead",
  "Añadir pista": "Add Track",
  "Crear pista": "Create Track",
  "Eliminar pista": "Delete Track",
  "Pista": "Track",
  "Pistas": "Tracks",
  "Capa": "Layer",
  "Capas": "Layers",
  "Clip": "Clip",
  "Clips": "Clips",
  "Subtítulos": "Subtitles",
  "Subtítulo": "Subtitle",
  "Subs": "Subs",
  "Inspector": "Inspector",
  "Render": "Render",
  "Render final": "Final Render",
  "Renderizar": "Render",
  "Renderizar vídeo": "Render Video",
  "Renderizar MP4": "Render MP4",
  "Renderizando...": "Rendering...",
  "Renderizando…": "Rendering...",
  "Confirmar render": "Confirm Render",
  "Renderizar de nuevo": "Render Again",
  "Reintentar render": "Retry Render",
  "MP4 listo": "MP4 Ready",
  "Negro / sin visual activo": "Black / no active visual",
  "sin audio activo": "no active audio",
  "Sin clip seleccionado.": "No clip selected.",
  "Sin medios conectados": "No connected media",
  "Media no disponible": "Media unavailable",
  "Cargando media": "Loading media",
  "Visual": "Visual",
  "Fuente": "Source",
  "Fuente de transcripción": "Transcription Source",
  "Salida": "Output",
  "Segmentos": "Segments",
  "Editar segmento": "Edit Segment",
  "Quemar en render": "Burn into render",
  "Inicio": "Start",
  "Final": "End",
  "Fin": "End",
  "Duración": "Duration",
  "Volumen": "Volume",
  "Silenciar": "Mute",
  "Encuadre": "Framing",
  "Movimiento": "Motion",
  "Transformación": "Transform",
  "Opacidad": "Opacity",
  "Escala": "Scale",
  "Rotación": "Rotation",
  "Posición": "Position",
  "Recorte": "Trim",
  "Trim inicio": "Trim Start",
  "Trim final": "Trim End",
  "Audio del vídeo": "Video Audio",
  "Bloqueado": "Locked",
  "Activo": "Active",
  "Activa": "Active",
  "Inactivo": "Inactive",
  "Mover": "Move",
  "Dividir": "Split",
  "Cortar clip": "Cut Clip",
  "Ir al inicio": "Go to Start",
  "Ir al final": "Go to End",
  "Reproducir": "Play",
  "Pausar": "Pause",
  "Siguiente frame": "Next Frame",
  "Frame anterior": "Previous Frame",
  "Ajustar zoom": "Fit Zoom",
  "Zoom": "Zoom",
  "Forma": "Shape",
  "Color": "Color",
  "Fondo": "Background",
  "Fondo del lienzo e idioma": "Canvas Background and Language",
  "Borde": "Border",
  "Sombra": "Shadow",
  "Texto SRT": "SRT Text",
  "Pegar SRT": "Paste SRT",
  "Crear subtítulos": "Create Subtitles",
  "Sin subtítulos": "No subtitles",
  "Orientación": "Orientation",
  "Orientación horizontal (intercambia alto y ancho si está en vertical)":
    "Horizontal orientation (swaps height and width if vertical)",
  "Orientación vertical (intercambia alto y ancho si está en horizontal)":
    "Vertical orientation (swaps height and width if horizontal)",
  "Lienzo único — P pantalla completa": "Single Canvas - P full screen",
  "Horizontal": "Horizontal",
  "Vertical": "Vertical",
  "Cuadrado": "Square",

  "Guion": "Script",
  "Guionista": "Scriptwriter",
  "Artículo": "Article",
  "Campaña": "Campaign",
  "Adaptaciones": "Adaptations",
  "Revisión": "Review",
  "Longitud": "Length",
  "Corto": "Short",
  "Medio": "Medium",
  "Largo": "Long",
  "Tono": "Tone",
  "Profesional": "Professional",
  "Institucional": "Institutional",
  "Irónico": "Ironic",
  "Emocional": "Emotional",
  "Objetivo": "Goal",
  "Explicar": "Explain",
  "Convencer": "Persuade",
  "Vender": "Sell",
  "Presentar": "Present",
  "Inspirar": "Inspire",
  "Abrir conversación": "Open conversation",
  "Audiencia": "Audience",
  "Instrucciones extra": "Extra Instructions",
  "Ajustes de escritura": "Writing Settings",
  "Transformar": "Transform",
  "Crear derivados": "Create Derivatives",
  "Variantes": "Variants",
  "Resumen": "Summary",
  "Titular": "Headline",
  "Descripción": "Description",
  "Selección actual": "Current Selection",
  "Brain está usando contexto editorial resumido:": "Brain is using summarized editorial context:",
  "Sin Brain conectado. Usará solo tu briefing y los ajustes de escritura.":
    "No Brain connected. It will only use your briefing and writing settings.",
  "Sin trazas técnicas ni JSON. Solo dirección editorial útil.":
    "No technical traces or JSON. Only useful editorial direction.",
  "Estas adaptaciones se guardarán como posts independientes en Generated Media.":
    "These adaptations will be saved as independent posts in Generated Media.",
  "Escribe el comentario editorial sobre la selección…": "Write the editorial comment about the selection...",
  "Título del texto": "Text Title",
  "¿Qué quieres escribir?": "What do you want to write?",
  "Escribe una idea, briefing, nota o pega un texto aquí. No hace falta que esté perfecto.":
    "Write an idea, briefing, note, or paste text here. It does not need to be perfect.",
  "Notas": "Notes",
  "Notas visuales": "Visual Notes",
  "Voice over": "Voice-over",
  "On-screen text": "On-screen Text",

  "Cine": "Cinema",
  "Dirección": "Direction",
  "Dirección audiovisual": "Audiovisual Direction",
  "Mesa de dirección": "Direction Desk",
  "Mesa de dirección audiovisual": "Audiovisual Direction Desk",
  "Editar dirección": "Edit Direction",
  "Dirección aplicada": "Applied Direction",
  "Dirección visual general": "General Visual Direction",
  "Descripción de cámara": "Camera Description",
  "Reparto": "Cast",
  "Personajes": "Characters",
  "Personaje": "Character",
  "Protagonista": "Protagonist",
  "Fondos": "Backgrounds",
  "Localización": "Location",
  "Localizaciones": "Locations",
  "Añadir personaje": "Add Character",
  "Añadir fondo": "Add Background",
  "Crear hoja": "Create Sheet",
  "Regenerar hoja": "Regenerate Sheet",
  "Crear hoja de personajes": "Create Character Sheet",
  "Crear hoja de localizaciones": "Create Location Sheet",
  "Referencia visual pendiente.": "Visual reference pending.",
  "Luz definida": "Light defined",
  "Tipo de plano": "Shot Type",
  "Estilo visual": "Visual Style",
  "Estilo de cámara": "Camera Style",
  "Cámara": "Camera",
  "Cámara en mano suave, ópticas naturales...": "Soft handheld camera, natural lenses...",
  "Define cómo debe sentirse la pieza antes de producirla.":
    "Define how the piece should feel before producing it.",
  "Identidad visual de personajes. Primero imagen, después detalles.":
    "Character visual identity. Image first, details after.",
  "Esta hoja funciona como referencia global para frames. No genera vídeo ni abre Nano; solo refuerza continuidad visual.":
    "This sheet works as a global frame reference. It does not generate video or open Nano; it only reinforces visual continuity.",
  "Localizaciones reutilizables. Imagen, atmósfera y continuidad antes que formulario.":
    "Reusable locations. Image, atmosphere, and continuity before form fields.",
  "Conservar arquitectura, luz, texturas y atmósfera entre escenas.":
    "Preserve architecture, light, textures, and atmosphere across scenes.",
  "Esta hoja compone las localizaciones como referencia global para los frames. No crea vídeo ni cambia el VideoNode.":
    "This sheet composes locations as a global frame reference. It does not create video or change the VideoNode.",
  "Una cuadrícula visual de escenas. La imagen manda; los controles acompañan.":
    "A visual grid of scenes. The image leads; the controls support it.",
  "Prompt preparado": "Prompt prepared",
  "Estilo propio": "Custom style",
  "Inicio + final": "Start + End",
  "Referencias": "References",
  "Referencias usadas": "References Used",

  "Historial": "History",
  "Cambios": "Changes",
  "Ningún cambio todavía": "No changes yet",
  "Luego podrás pintar zonas y generar desde arriba.": "Then you can paint zones and generate from above.",
  "Usa": "Use",
  "para pintar qué editar, o": "to paint what to edit, or",
  "para el resto.": "for the rest.",
  "Revisa refs y el texto que se enviará a Image Creation": "Review refs and the text that will be sent to Image Creation",
  "Sin imágenes de referencia.": "No reference images.",
  "Súbelas en cada cambio con el ícono 📎.": "Upload them in each change with the 📎 icon.",
  "Última composición": "Last Composition",
  "Vista previa de la llamada": "Call Preview",
  "Ver llamada": "View Call",
  "Ref 1 · Imagen base": "Ref 1 · Base Image",
  "Imagen base": "Base Image",
  "Sin imagen base": "No base image",
  "Prompt completo (editable)": "Full Prompt (Editable)",
  "Generación": "Generation",
  "Edición guiada por zonas": "Zone-guided editing",
  "Añadir cambio": "Add Change",
  "Eliminar cambio": "Delete Change",
  "Zona": "Zone",
  "Zonas": "Zones",
  "Pintar": "Paint",
  "Borrador": "Eraser",
  "Máscara": "Mask",
  "Referencia": "Reference",
  "Referencias visuales": "Visual References",
  "Documentación recibida": "Received Documentation",
  "Sube y analiza al instante": "Upload and analyze instantly",
  "capa visual sin pasos extra. Las URLs se procesan al pulsar": "visual layer with no extra steps. URLs are processed when you press",
  "Posts, artículos, guiones, escenas, slides, campañas y reescrituras.":
    "Posts, articles, scripts, scenes, slides, campaigns, and rewrites.",
  "Marca (desde Brain · no editable aquí)": "Brand (from Brain · not editable here)",
  "(desde Brain · no editable aquí)": "(from Brain · not editable here)",
  "Resultados generados por nodos: imágenes IA, vídeos IA, renders, variaciones, Background Remover, VFX, etc.":
    "Results generated by nodes: AI images, AI videos, renders, variations, Background Remover, VFX, etc.",
  "Archivos finales exportados desde Foldder: PNG, JPG, PDF, vídeo o entregables listos para usar.":
    "Final files exported from Foldder: PNG, JPG, PDF, video, or deliverables ready to use.",
  "Resultados generados por Brain, IA, renders, VFX y nodos automáticos.":
    "Results generated by Brain, AI, renders, VFX, and automatic nodes.",
  "Revisión y descarga multimedia": "Media Review and Download",
  "Este medio todavía no ha sido generado.": "This media has not been generated yet.",
  "Todavía no hay archivos Studio visibles.": "There are no visible Studio files yet.",
  "Ningún objeto bajo este prefijo.": "No objects under this prefix.",
  "Texto de búsqueda (entrada)": "Search Text (Input)",
  "Salida (título del nodo: texto elegido)": "Output (node title: chosen text)",
  "El prompt mejorado aparecerá aquí…": "The enhanced prompt will appear here...",
  "Sin vídeo todavía": "No video yet",
  "Describe el plano, sujeto, acción, entorno, luz, estilo y locks.":
    "Describe the shot, subject, action, environment, light, style, and locks.",
  "NB 1 (rápido) solo genera en 1K. Para 2K/4K usa NB 2 o Pro. Varios pasos img→img pueden suavizar detalle.":
    "NB 1 (fast) only generates in 1K. For 2K/4K use NB 2 or Pro. Multiple img-to-img steps can soften detail.",
  "Pinta sobre la imagen qué parte quieres cambiar": "Paint over the image area you want to change",
  "Instrucción que afecta a toda la imagen": "Instruction that affects the whole image",
  "Resolución de salida": "Output Resolution",
  "finalPromptUsed (recorte):": "finalPromptUsed (excerpt):",
  "Clasificación por": "Classification by",
  "señales técnicas": "technical signals",
  "Imágenes / confianza": "Images / Confidence",
  "Imágenes / capa visual": "Images / Visual Layer",
  "Sin fecha de último análisis visual en metadatos.": "No last visual analysis date in metadata.",
  "Origen típico:": "Typical source:",
  "Ningún documento CORE con estado «Analizado».": "No CORE document with “Analyzed” status.",
  "Aprendizajes pendientes: usados en la lógica de este bloque.":
    "Pending learnings: used in this block's logic.",
  "No aplica a este bloque (no usa visión de imagen en el resumen).":
    "Not applicable to this block (it does not use image vision in the summary).",
  "¿De dónde sale esto?": "Where Does This Come From?",
  "Sí (mock o fallback en esta fuente)": "Yes (mock or fallback in this source)",
  "Confirmar eliminación": "Confirm deletion",
  "Archivos sin asignar / Orphan files:": "Unassigned files / Orphan files:",
  "Top 3 APIs más usadas": "Top 3 Most Used APIs",
  "Ordenadas por número de llamadas. Útil para detectar coste silencioso aunque el coste unitario sea bajo.":
    "Sorted by number of calls. Useful for detecting silent cost even when unit cost is low.",
  "Visión general": "Overview",
  "IA vídeo": "AI video",
  "Análisis visual": "Visual analysis",

  "Brain resume así tu marca": "Brain Summarizes Your Brand Like This",
  "Añade frase o ejemplo real": "Add a phrase or real example",
  "ej: mejor del mundo, garantía total": "e.g. best in the world, total guarantee",
  "Nivel de sofisticación": "Sophistication level",
  "Sofisticación del mercado": "Market sophistication",
  "Disparadores de atención (coma separada)": "Attention triggers (comma-separated)",
  "Instrucción adicional (opcional)": "Additional instruction (optional)",
  "Diagnóstico": "Diagnostics",
  "Diagnóstico técnico JSON": "Technical JSON Diagnostics",
  "Estado técnico": "Technical Status",
  "Cápsulas visuales": "Visual Capsules",
  "Señales recientes por nodo": "Recent Signals by Node",
  "Señales recientes": "Recent Signals",
  "Sin señales recientes": "No recent signals",
  "Visión remota": "Remote Vision",
  "Visión remota inactiva (mock).": "Remote vision inactive (mock).",
  "Comprobando visión en servidor…": "Checking server vision...",
  "No se pudo comprobar visión (sesión o red).": "Could not check vision (session or network).",
  "Mismo efecto que «Guardar proyecto» en el lienzo.": "Same effect as “Save project” on the canvas.",
  "Validación 3 imágenes (dev)": "3-image Validation (dev)",
  "Analizadas con API de visión": "Analyzed with vision API",
  "Heurística o simulado": "Heuristic or simulated",
  "Sin capa aún": "No layer yet",
  "Sin fila de análisis": "No analysis row",
  "Versión": "Version",
  "Imagen para visión": "Image for Vision",
  "Fallback": "Fallback",
  "Composición": "Composition",
  "Inventario de sabiduría": "Wisdom Inventory",
  "Bandeja vacía.": "Empty tray.",
  "Marca": "Brand",
  "Claims extraídos": "Extracted Claims",
  "Métricas detectadas": "Detected Metrics",
  "Sin métricas": "No metrics",
  "Tú": "You",
  "Ideas para subir más": "Ideas to Upload More",
  "El modelo aprende por analogía: ejemplos aprobados/prohibidos y piezas reales.":
    "The model learns by analogy: approved/forbidden examples and real pieces.",
  "Pieza que sí suena": "Piece That Sounds Right",
  "Aún no hay ejemplos guardados.": "There are no saved examples yet.",
  "Tabús y frases aprobadas": "Taboos and Approved Phrases",
  "Tabú de marca": "Brand Taboo",
  "Ingeniería de voz (funcional)": "Voice Engineering (Functional)",
  "Términos preferidos": "Preferred Terms",
  "Términos prohibidos": "Forbidden Terms",
  "Mostramos solo las personas relevantes para este proyecto. El resto está en “+ Nueva persona”.":
    "Only people relevant to this project are shown. The rest are under “+ New Person”.",
  "No hay personas aún.": "There are no people yet.",
  "Sofisticación": "Sophistication",
  "Sofisticación mercado": "Market Sophistication",
  "Añadir Nueva Persona": "Add New Person",
  "Selecciona del catálogo restante o crea una persona manual.":
    "Select from the remaining catalog or create a person manually.",
  "Creación manual (opción B)": "Manual Creation (Option B)",
  "Añadir persona manual": "Add Manual Persona",
  "Consideración": "Consideration",
  "Conversión": "Conversion",
  "Retención": "Retention",
  "Añadir fila de matriz": "Add Matrix Row",
  "Añadir mensaje simple": "Add Simple Message",
  "Crear pieza con este ADN": "Create Piece with This DNA",
  "Modo crítico automático": "Automatic Critical Mode",
  "Versión revisada": "Revised Version",
  "Crítica": "Critique",
  "Verificación: Todas": "Verification: All",
  "Verificación: Solo verificadas": "Verification: Verified Only",
  "Verificación: Solo interpretadas": "Verification: Interpreted Only",
  "Fuerza: Débil": "Strength: Weak",

  "Los colores del lienzo aparecen aquí.": "Canvas colors appear here.",
  "Cargando la página…": "Loading the page...",
  "Preparando las páginas para descarga…": "Preparing pages for download...",
  "Importar documento .de (páginas e imágenes embebidas)":
    "Import .de document (pages and embedded images)",
  "Exportar documento .de (ZIP: JSON + imágenes, sin depender de S3)":
    "Export .de document (ZIP: JSON + images, without depending on S3)",
  "Marco elíptico (O). ⇧ al arrastrar = círculo. Ctrl/⌘ suma; Alt resta.":
    "Elliptical frame (O). Shift while dragging = circle. Ctrl/Cmd adds; Alt subtracts.",
  "Selección directa (A)": "Direct Selection (A)",
  "Rectángulo (R)": "Rectangle (R)",
  "Línea": "Line",
  "Tampón de clon (S) — Alt+clic en la imagen = origen; pinta clonando con el mismo tamaño/dureza/opacidad/flow":
    "Clone Stamp (S): Alt+click on the image = source; paint cloning with the same size/hardness/opacity/flow",
  "Pincel (B) — pinta en capas imagen; clic en vacío crea capa del tamaño del pliego":
    "Brush (B): paint on image layers; click on empty space to create a layer the size of the spread",
  "Degradado (⇧G) — arrastra en capa o máscara (modo máscara = destino máscara); ajustes en Propiedades; doble clic en vértice = color":
    "Gradient (Shift+G): drag on layer or mask (mask mode = mask target); settings in Properties; double-click vertex = color",
  "Añadir con selector de color": "Add with color picker",
  "Suelta un color para actualizar el relleno (y el pincel si usa esta opción)":
    "Drop a color to update the fill (and the brush if it uses this option)",
  "Rasteriza solo la selección actual y la sustituye por una capa imagen":
    "Rasterize only the current selection and replace it with an image layer",
  "Elige un color para relleno sólido (reactiva el relleno)":
    "Choose a solid fill color (reactivates fill)",
  "Arrastra horizontalmente · Mayús = ×10": "Drag horizontally · Shift = ×10",
  "Sin trazo (ningún borde)": "No stroke (no border)",
  "Alternar fase del patrón": "Toggle pattern phase",
  "Texto en trazado": "Text on Path",
  "Inicio en trazado": "Start on Path",
  "Aplica el boolean de forma destructiva: un solo trazo vectorial. Luego usa Pegar dentro (⇧⌘V) con este trazo como máscara.":
    "Apply the boolean destructively: a single vector path. Then use Paste Inside (Shift+Cmd+V) with this path as a mask.",
  "Nueva capa vacía (arriba del todo). Arrastra una capa aquí para duplicarla.":
    "New empty layer (at the very top). Drag a layer here to duplicate it.",
  "Aplicar a la selección actual": "Apply to current selection",
  "Lista vacía": "Empty List",
  "La lista está vacía. Todavía no hay medios generados.": "The list is empty. There is no generated media yet.",
  "Conecta un nodo": "Connect a node",
  "a la izquierda.": "on the left.",
  "Ver tamaño completo": "View full size",
  "Editar título": "Edit title",
  "Más acciones": "More actions",
  "Estilo principal": "Main Style",
  "Editar matriz": "Edit Matrix",
  "Suave (simétrico)": "Smooth (Symmetric)",
  "Partir (tangente continua asimétrica)": "Split (Asymmetric Continuous Tangent)",
  "Esquina (independiente)": "Corner (Independent)",
  "Feather (máscara suave)": "Feather (Soft Mask)",
  "Párrafo": "Paragraph",
  "Bloquear núcleo": "Lock Core",
  "Lím.": "Lim.",
  "Extremos línea": "Line Ends",
  "Separación": "Spacing",
  "Mostrar guía": "Show Guide",
  "Ángulo": "Angle",
  "Arrastra para mover el encuadre del vídeo": "Drag to move the video crop",
  "Quitar vídeo de la imagen": "Remove video from image",
  "Ej.: cámara lenta acercándose, gente moviéndose al fondo, luz dorada de atardecer…":
    "E.g.: slow camera moving closer, people moving in the background, golden sunset light...",
  "Vídeo en imagen": "Video in Image",
  "Marco de vídeo": "Video Frame",
  "Segundos del fotograma · Arrastra horizontalmente · Mayús = ×10":
    "Frame seconds · drag horizontally · Shift = ×10",
  "Conexión": "Connection",
  "Presentación": "Presentation",
  "Arrastra para mover el grupo · doble clic para editar el título":
    "Drag to move the group · double-click to edit the title",
  "Arrastrar guía horizontal": "Drag horizontal guide",
  "Arrastrar guía vertical": "Drag vertical guide",
  "Añadir página": "Add page",
  "Intercambiar orientación": "Swap orientation",
  "Tamaño del pliego (preset)": "Spread size (preset)",
  "Duplicar página": "Duplicate page",
  "Eliminar página": "Delete page",
  "Añadir color (selector)": "Add color (picker)",
  "Modo presentación (tecla P); pantalla completa desde la barra inferior":
    "Presentation mode (P key); full screen from the bottom bar",
  "Propiedades (vídeo)": "Properties (Video)",
  "Describe cambios… Con nodos seleccionados: «cambia el prompt», «pon resolución 4K», «conecta a Image Creation»…":
    "Describe changes... With selected nodes: “change the prompt”, “set 4K resolution”, “connect to Image Creation”...",
  "Ej.: borra todo · con selección: cambia el texto del prompt, sube resolución a 4K…":
    "E.g.: delete everything · with a selection: change the prompt text, raise resolution to 4K...",

  "Siete capas en orden fijo: el modelo prioriza lo que va primero; no es estética, es peso. Puedes dejar capas vacías o acortar frases.":
    "Seven layers in a fixed order: the model prioritizes what comes first; it is not decoration, it is weight. You can leave layers empty or shorten sentences.",
  "Plano y cámara (primera frase del texto): encuadre y movimiento. [velocidad] + [movimiento] + [origen] + [destino]. Máx. dos movimientos por frase; más movimientos → «then» en inglés.":
    "Shot and camera (first sentence of the text): framing and movement. [speed] + [movement] + [origin] + [destination]. Max two movements per sentence; add more with 'then' in English.",
  "Sujeto: identidad y detalle físico. Con ref, tag @ImageN aquí; sin ref, más descripción.":
    "Subject: identity and physical detail. With a reference, place @ImageN here; without a reference, add more description.",
  "Acción y física: acción del personaje; físicas del entorno en frases aparte (no mezclar).":
    "Action and physics: character action; environment physics in separate sentences (do not mix).",
  "Entorno: un dominante, uno de atmósfera, uno de fondo (no más de tres).":
    "Environment: one dominant place, one atmosphere detail, one background detail (no more than three).",
  "Iluminación: máximo impacto. Primaria + dirección + color; secundaria; ausencias de luz.":
    "Lighting: highest impact. Primary + direction + color; secondary; absent light.",
  "Estilo: lente, grade, grano, bokeh, ratio…": "Style: lens, grade, grain, bokeh, ratio...",
  "Locks (última frase): cara/identidad/ropa; sin artefactos ni objetos flotantes.":
    "Locks (last sentence): face/identity/clothing; no artifacts or floating objects.",
  "La luz manda en resultado visual: puedes describirla en la capa 5 y/o usar el preset Luz del gestor (se fusiona como refuerzo al enviar).":
    "Light drives the visual result: describe it in layer 5 and/or use the Light preset in the manager (it merges as reinforcement when sending).",
  "Separa movimiento de cámara y del sujeto. El preset de API va al final del prompt de red; conviene que la primera frase del texto describa igualmente plano/movimiento para el peso del modelo.":
    "Separate camera movement from subject movement. The API preset goes at the end of the network prompt; the first text sentence should still describe shot/movement for model weight.",
  "«Fast» + cámara rápida + escena muy cargada suele producir jitter; tensiona solo un eje si buscas ritmo fuerte.":
    "'Fast' + fast camera + very busy scene often creates jitter; push only one axis if you want strong rhythm.",
  "@Image ancla apariencia; @Video movimiento; @Audio atmósfera. Hasta 9 imágenes, 3 vídeos y 3 audios (máx. 12 archivos). Orden API: 1º frame grafo → último → @Image1…":
    "@Image anchors appearance; @Video anchors motion; @Audio anchors atmosphere. Up to 9 images, 3 videos, and 3 audios (max 12 files). API order: graph first frame -> last -> @Image1...",
} satisfies TranslationMap;

type PatternTranslator = {
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
};

const EN_PATTERNS: PatternTranslator[] = [
  { pattern: /^Escena (\d+)$/i, replace: (match) => `Scene ${match[1]}` },
  { pattern: /^Imagen (\d+)$/i, replace: (match) => `Image ${match[1]}` },
  { pattern: /^Generación (\d+)$/i, replace: (match) => `Generation ${match[1]}` },
  { pattern: /^Proyecto (\d+)$/i, replace: (match) => `Project ${match[1]}` },
  { pattern: /^Proyectos \((.+)\)$/i, replace: (match) => `Projects (${match[1]})` },
  { pattern: /^Eliminar \((.+)\)$/i, replace: (match) => `Delete (${match[1]})` },
  { pattern: /^Añadir (.+)$/i, replace: (match) => `Add ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^Eliminar (.+)$/i, replace: (match) => `Delete ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^Crear (.+)$/i, replace: (match) => `Create ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^Editar (.+)$/i, replace: (match) => `Edit ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^Generar (.+)$/i, replace: (match) => `Generate ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^Regenerar (.+)$/i, replace: (match) => `Regenerate ${translateText(match[1] ?? "", "en")}` },
  { pattern: /^(.+) pendientes$/i, replace: (match) => `${match[1]} pending` },
  { pattern: /^(.+) items · (.+) pendientes$/i, replace: (match) => `${match[1]} items · ${match[2]} pending` },
  { pattern: /^(.+) archivos$/i, replace: (match) => `${match[1]} files` },
  { pattern: /^(.+) nodos$/i, replace: (match) => `${match[1]} nodes` },
  { pattern: /^(.+) proyectos$/i, replace: (match) => `${match[1]} projects` },
  { pattern: /^Capa activa: (.+)$/i, replace: (match) => `Active layer: ${match[1]}` },
  { pattern: /^Pista activa: (.+)$/i, replace: (match) => `Active track: ${match[1]}` },
  { pattern: /^Duración: (.+)$/i, replace: (match) => `Duration: ${match[1]}` },
  { pattern: /^Inicio: (.+)$/i, replace: (match) => `Start: ${match[1]}` },
  { pattern: /^Final: (.+)$/i, replace: (match) => `End: ${match[1]}` },
  { pattern: /^(.+) activo$/i, replace: (match) => `${match[1]} active` },
  { pattern: /^(.+) activa$/i, replace: (match) => `${match[1]} active` },
  { pattern: /^(.+) seleccionado$/i, replace: (match) => `${match[1]} selected` },
  { pattern: /^(.+) seleccionados$/i, replace: (match) => `${match[1]} selected` },
  { pattern: /^(.+) seleccionado\(s\)$/i, replace: (match) => `${match[1]} selected` },
  { pattern: /^Generando (.+)\.\.\.$/i, replace: (match) => `Generating ${translateText(match[1] ?? "", "en")}...` },
  { pattern: /^Generando (.+)…$/i, replace: (match) => `Generating ${translateText(match[1] ?? "", "en")}...` },
  { pattern: /^(.+) · prompt$/i, replace: (match) => `${match[1]} · prompt` },
];

const normalizedEnglishTranslations = new Map<string, string>(
  Object.entries(FOLDDER_TRANSLATIONS_EN).map(([source, target]) => [
    normalizeTranslatableText(source),
    target,
  ]),
);

const normalizedEnglishTranslationsLower = new Map<string, string>(
  Object.entries(FOLDDER_TRANSLATIONS_EN).map(([source, target]) => [
    normalizeTranslatableText(source).toLocaleLowerCase("es-ES"),
    target,
  ]),
);

const fragmentTranslations = Object.entries(FOLDDER_TRANSLATIONS_EN)
  .map(([source, target]) => [normalizeTranslatableText(source), target] as const)
  .filter(([source]) => source.length >= 4 && source.length <= 46 && !/[.!?]/.test(source))
  .sort((a, b) => b[0].length - a[0].length);

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === "es" || value === "en";
}

export function normalizeTranslatableText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function translateText(value: string, language: AppLanguage): string {
  if (language === "es") return value;
  if (!value.trim()) return value;

  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = normalizeTranslatableText(value);
  const translated = translateCoreToEnglish(core);

  if (!translated || translated === core) return value;
  return `${leading}${translated}${trailing}`;
}

function translateCoreToEnglish(core: string): string {
  const exact = normalizedEnglishTranslations.get(core);
  if (exact) return exact;

  const lowerExact = normalizedEnglishTranslationsLower.get(core.toLocaleLowerCase("es-ES"));
  if (lowerExact) return applySourceCaseStyle(core, lowerExact);

  const numberedSection = core.match(/^(\d+)\s*([·•])\s*(.+)$/);
  if (numberedSection) {
    return `${numberedSection[1]} ${numberedSection[2]} ${translateCoreToEnglish(
      numberedSection[3] ?? "",
    )}`;
  }

  for (const translator of EN_PATTERNS) {
    const match = core.match(translator.pattern);
    if (match) return translator.replace(match);
  }

  const segmented = translateSegmentedCore(core);
  if (segmented !== core) return segmented;

  return translateShortUiFragments(core);
}

function translateSegmentedCore(core: string): string {
  if (!/[·|/:—–→]/.test(core)) return core;

  const pieces = core.split(/(\s+·\s+|\s+\/\s+|\s+\|\s+|\s+—\s+|\s+–\s+|\s*→\s*|:\s+)/);
  if (pieces.length < 3) return core;

  let changed = false;
  const next = pieces
    .map((piece, index) => {
      if (index % 2 === 1 || !piece.trim()) return piece;
      const translated = translateCoreToEnglish(piece);
      if (translated !== piece) changed = true;
      return translated;
    })
    .join("");

  return changed ? next : core;
}

function translateShortUiFragments(core: string): string {
  if (core.length > 96) return core;
  const wordCount = core.split(/\s+/).filter(Boolean).length;
  if (wordCount > 2 && !isUpperCaseLabel(core)) return core;

  let next = core;
  for (const [source, target] of fragmentTranslations) {
    const pattern = new RegExp(
      `(^|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])(${escapeRegExp(source)})(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9])`,
      "gi",
    );
    next = next.replace(pattern, (_full, prefix: string, match: string) => {
      return `${prefix}${applySourceCaseStyle(match, target)}`;
    });
  }

  return next;
}

function applySourceCaseStyle(source: string, target: string): string {
  if (isUpperCaseLabel(source)) return target.toLocaleUpperCase("en-US");
  return target;
}

function isUpperCaseLabel(value: string): boolean {
  const letters = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letters.length > 0 && letters === letters.toLocaleUpperCase("es-ES");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

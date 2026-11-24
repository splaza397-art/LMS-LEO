// Contenido institucional tomado del sitio WordPress vigente (https://iinicia.org), revisado el 24/11/2026.
// Solo se migra texto publicado por IINICIA. Se descartaron elementos de plantilla del tema:
// testimonios con nombres ficticios, datos de contacto de ejemplo y la entrada "Hello world!".
// Correcciones: solo ortografia evidente (p. ej. "Profesores as 24hrs", "profundizar tus en areas").

const WP = 'https://iinicia.org';

export interface ProgramSource {
  slug: string; name: string; level: 'licenciatura' | 'diplomado' | 'certificacion' | 'curso';
  summary: string; description: string; image?: string; source: string; legacy: string;
}

export const PROGRAMS: ProgramSource[] = [
  {
    slug: 'base-de-datos',
    name: 'Base de Datos',
    level: 'curso',
    summary: 'Domina el almacenamiento y gestión de datos.',
    description: [
      'Aprende a modelar, crear, consultar y optimizar bases de datos con ejemplos prácticos y proyectos reales usando SQL y otras tecnologías clave.',
      '',
      '## ¿Qué lograrás?',
      'Habilidades que podrás aplicar en proyectos reales y en tu trabajo.',
      '',
      '- **Modelado de datos:** aprende a diseñar esquemas eficientes y normalizados.',
      '- **Consultas SQL:** domina SELECT, JOIN, funciones y subconsultas.',
      '- **Optimización:** usa índices, vistas y técnicas para mejorar el rendimiento.',
      '',
      'Incluye un proyecto final.',
    ].join('\n'),
    image: `${WP}/wp-content/uploads/2025/08/base-de-datos.webp`,
    source: `${WP}/?sfwd-courses=geografia-2`,
    legacy: '/?sfwd-courses=geografia-2',
  },
  {
    slug: 'inter-comunicaciones',
    name: 'Inter Comunicaciones',
    level: 'curso',
    summary: 'Domina las herramientas y técnicas para una comunicación efectiva y segura.',
    description: [
      'Aprende los principios, tecnologías y mejores prácticas para comunicarte con éxito en entornos personales y profesionales.',
      '',
      '## ¿Qué lograrás?',
      'Competencias que podrás aplicar en tu vida profesional y personal.',
      '',
      '- **Comprender los fundamentos:** adquiere conocimientos sólidos de inter comunicaciones y su importancia.',
      '- **Manejar tecnologías clave:** dominio de sistemas, protocolos y herramientas digitales.',
      '- **Aplicar buenas prácticas:** mejora continua en la comunicación efectiva y segura.',
      '',
      'Incluye un proyecto final.',
    ].join('\n'),
    image: `${WP}/wp-content/uploads/2025/08/Fundamentos-de-intercomunicacion-Portada-1024x1024.png`,
    source: `${WP}/?sfwd-courses=fundamentos-de-inter-comunicaciones`,
    legacy: '/?sfwd-courses=fundamentos-de-inter-comunicaciones',
  },
  {
    slug: 'diplomado-en-ingenieria-informatica',
    name: 'Diplomado en Ingeniería Informática',
    level: 'diplomado',
    summary: 'Programa en línea para profundizar en áreas clave de la ingeniería informática.',
    description: 'Próximamente publicaremos el plan de estudios de este diplomado.',
    source: `${WP}/?groups=diplomado-en-ingenieria-informatica`,
    legacy: '/?groups=diplomado-en-ingenieria-informatica',
  },
  {
    slug: 'certificacion-universitaria-en-ingenieria-informatica',
    name: 'Certificación Universitaria en Ingeniería Informática',
    level: 'certificacion',
    summary: 'Valida tus habilidades en ingeniería informática con una certificación universitaria.',
    description: 'Próximamente publicaremos el plan de estudios de esta certificación.',
    image: `${WP}/wp-content/uploads/2025/06/portada_certificacion.png`,
    source: `${WP}/?groups=certificacion-universitaria-en-ingenieria-informatica`,
    legacy: '/?groups=certificacion-universitaria-en-ingenieria-informatica',
  },
];

export interface PageSource { slug: string; title: string; summary: string; body: string; source: string; order: number }

export const PAGES: PageSource[] = [
  {
    slug: 'quienes-somos',
    title: 'Quiénes somos',
    summary: 'Descubre tu potencial en Universidad IINICIA. ¡Tu futuro comienza hoy!',
    order: 1,
    source: `${WP}/?page_id=1172`,
    body: [
      'IINICIA, Instituto de Innovación y Ciencias Aplicadas. Descubre tu potencial en Universidad IINICIA: ¡tu futuro comienza hoy!',
      '',
      '## Prepárate con expertos',
      'Contamos con docentes altamente capacitados, cuidadosamente seleccionados para garantizar la mejor calidad educativa.',
      '',
      '## Avanza a tu propio ritmo',
      'En Universidad IINICIA, la educación evoluciona contigo. Somos líderes en formación académica, adaptando nuestro conocimiento a tu ritmo para formar profesionistas listos para el futuro.',
      '',
      '## Certificación profesional',
      'Al finalizar, recibirás un certificado que respaldará tus conocimientos y habilidades en el área, brindándote mayor reconocimiento y oportunidades en tu crecimiento profesional.',
    ].join('\n'),
  },
  {
    slug: 'mision-vision',
    title: 'Misión y visión',
    summary: 'Educación en línea accesible, flexible y de alta calidad para el mundo hispanohablante.',
    order: 2,
    source: `${WP}/?page_id=1172`,
    body: [
      '## Nuestra misión',
      'Empoderar a cada persona a través de una educación en línea accesible, flexible y de alta calidad. Brindamos cursos por bloques con certificación válida, acompañamiento personalizado e inteligencia artificial 24/7 para impulsar el desarrollo personal y profesional de nuestros estudiantes.',
      '',
      '## Nuestra visión',
      'Ser la universidad digital de referencia en el mundo hispanohablante. Nos proyectamos como una comunidad global de estudiantes transformadores, guiados por una educación innovadora, práctica y con impacto real en sus vidas y su entorno.',
    ].join('\n'),
  },
  {
    slug: 'modelo-educativo',
    title: 'Modelo educativo',
    summary: 'En IINICIA, tu aprendizaje se adapta a tu vida.',
    order: 3,
    source: `${WP}/`,
    body: [
      'Diseñamos una experiencia flexible para que puedas estudiar sin dejar de lado tus responsabilidades diarias. Aprende a tu ritmo, desde donde estés, y haz que cada día cuente mientras construyes tu futuro profesional.',
      '',
      '## Experiencia',
      'Transforma teoría en práctica con proyectos que simulan situaciones reales del entorno laboral actual.',
      '',
      '## Certificación',
      'Obtén certificados digitales por cada curso completado, válidos para enriquecer tu currículum y fortalecer tu perfil profesional.',
      '',
      '## Contenidos',
      'Contenidos alineados al plan de estudios oficial, impartidos por expertos en cada materia y disponibles 24/7 para que aprendas a tu ritmo.',
      '',
      '## Nuestra oferta',
      '- **Carreras universitarias:** formación profesional completa con títulos oficiales, diseñada para el mundo digital.',
      '- **Badges digitales:** reconocimientos por logros específicos y competencias adquiridas.',
      '- **Certificaciones:** valida tus habilidades con certificaciones reconocidas en la industria.',
      '- **Diplomados en línea:** programas para profundizar en áreas clave.',
      '- **Profesores 24 horas:** soporte personalizado para cada materia, curso y programa.',
      '- **Cursos especializados:** aprende habilidades específicas con nuestros cursos cortos y enfocados.',
    ].join('\n'),
  },
];

/** URLs del sitio anterior que conviene conservar con 301. */
export const REDIRECTS: [string, string][] = [
  ['/?page_id=1172', '/universidad/quienes-somos'],
  ['/?page_id=1895', '/universidad'],
  ['/?page_id=1202', '/oferta'],
  ['/?page_id=1652', '/oferta'],
  ['/?page_id=1653', '/oferta'],
  ['/?page_id=16', '/registro'],
  ['/?page_id=2179', '/auth/login'],
  ['/?page_id=12', '/contacto'],
  ['/?page_id=9', '/mi-iinicia'],
  ['/?page_id=19', '/mi-iinicia'],
  ['/?page_id=18', '/auth/login'],
  ...PROGRAMS.map((p): [string, string] => [p.legacy, `/oferta/${p.slug}`]),
];

/** Datos de demostracion previos, reemplazados por el contenido real. */
export const DEMO_PROGRAM_SLUGS = [
  'licenciatura-innovacion-educativa', 'diplomado-docencia-digital', 'certificacion-diseno-instruccional', 'curso-fundamentos-innovacion',
];
export const DEMO_CONTENT: [string, string][] = [
  ['noticia', 'nueva-plataforma'], ['docente', 'docente-demostracion'], ['autoridad', 'autoridad-demostracion'],
];

# 07 · Manual de administración académica

Para administradores académicos, coordinadores y superadministradores. Todo se hace en **Mi Campus → Panel de gestión** (`/admin`). Cada persona solo ve las pestañas de su rol.

## Admitir a un aspirante

1. Pestaña **Solicitudes**: aparecen las solicitudes "en revisión".
2. Si corresponde, elige la **cohorte**.
3. Pulsa **Admitir**.

Al admitir, el sistema hace todo en un solo paso:
- Cambia el rol a estudiante.
- Crea su cuenta de Moodle.
- Lo matricula en los cursos del programa y lo agrega a la cohorte.
- Le envía un aviso.

Si Moodle no responde, verás un mensaje y la sincronización se completa sola en cuanto Moodle vuelva.

**Rechazar** pide confirmación y avisa a la persona. Una solicitud ya admitida no se rechaza: en su lugar se suspende la matrícula.

## Programas, cursos, cohortes y profesores

Pestaña **Programas**:

- **Nuevo programa / Editar programa**: nombre, ruta web (slug), nivel, duración, modalidad, portada, resumen, descripción y si aparece publicado en el portal.
- **Vincular curso**: relaciona cursos de Moodle con el programa. Las nuevas admisiones se matriculan en ellos.
- **Profesores**: elige a la persona (se muestra su correo para evitar confusiones) y el curso, y pulsa **Asignar profesor**. La persona debe tener el rol Profesor. **Retirar** conserva su historial en Moodle.
- **Cohortes**: nombre y fechas opcionales. Se crean también en Moodle.

Los cursos y su contenido académico se crean en Moodle. El portal solo los vincula.

## Usuarios

Pestaña **Usuarios**: búsqueda por nombre o correo, estado y estado de sincronización con Moodle.

- **Rol** (solo superadministrador): al elegir Coordinador hay que indicar el programa. Dar un rol con acceso al campus crea la cuenta de Moodle, y quitarlo suspende sus matrículas.
- **Matrículas**: suspende o reactiva cada curso. Las calificaciones se conservan.
- **Suspender / Reactivar** la cuenta: bloquea el acceso al portal, a Moodle y a la app de inmediato.
- **Sincronizar** (administrador técnico): fuerza la sincronización con Moodle.

Roles con privilegios (superadministrador, administrador técnico, administrador académico) deben configurar un autenticador en el celular la próxima vez que entren.

## Contenidos del portal

Pestaña **Contenidos**: noticias, páginas de Universidad, preguntas frecuentes, docentes, autoridades y contacto.

- El editor tiene botones de título, negrita, cursiva, lista, enlace e **Imagen**, y una **Vista previa**.
- Imágenes PNG, JPG o WebP de hasta 5 MB.
- **Estado**: "Borrador" no se publica. "Publicado" aparece de inmediato en el portal.
- **Título SEO / Descripción SEO**: lo que muestran los buscadores.
- **Eliminar** pide confirmación. La página deja de existir (responde 404).

**Pendientes de contenido institucional:** aviso de privacidad, términos, datos de contacto, docentes y autoridades.

## Solicitudes de información, avisos y reportes

- **Información**: mensajes del formulario de Admisiones. Márcalos como "atendida" al responder.
- **Avisos**: envía un aviso a todos los estudiantes activos de un programa. Aparece en Mi IINICIA y en la app.
- **Reportes**: solicitudes, estudiantes activos y suspendidos, profesores y cursos por programa. **Exportar CSV** para Excel.
- **Auditoría** (superadministrador y técnico): registro inalterable de las acciones sensibles.

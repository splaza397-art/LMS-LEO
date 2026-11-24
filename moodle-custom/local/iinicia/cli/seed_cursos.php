<?php
// Crea (si no existen) los cursos que IINICIA publica en su sitio actual y retira el curso de demostracion.
// La estructura sigue la seccion "¿Que lograras?" de cada curso en https://iinicia.org.
// El contenido academico de cada unidad lo cargan los docentes en Moodle.
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');

\core\session\manager::set_user(get_admin());

$category = $DB->get_record('course_categories', ['idnumber' => 'IINICIA-CURSOS']);
if (!$category) {
    $category = \core_course_category::create((object) ['name' => 'Cursos', 'idnumber' => 'IINICIA-CURSOS']);
}

$courses = [
    'BD-101' => [
        'fullname' => 'Base de Datos',
        'summary' => 'Aprende a modelar, crear, consultar y optimizar bases de datos con ejemplos prácticos y proyectos reales usando SQL y otras tecnologías clave.',
        'sections' => [
            'Modelado de datos' => 'Aprende a diseñar esquemas eficientes y normalizados.',
            'Consultas SQL' => 'Domina SELECT, JOIN, funciones y subconsultas.',
            'Optimización' => 'Usa índices, vistas y técnicas para mejorar el rendimiento.',
            'Proyecto final' => 'Aplica lo aprendido en un proyecto real.',
        ],
    ],
    'IC-101' => [
        'fullname' => 'Inter Comunicaciones',
        'summary' => 'Aprende los principios, tecnologías y mejores prácticas para comunicarte con éxito en entornos personales y profesionales.',
        'sections' => [
            'Comprender los fundamentos' => 'Adquiere conocimientos sólidos de inter comunicaciones y su importancia.',
            'Manejar tecnologías clave' => 'Dominio de sistemas, protocolos y herramientas digitales.',
            'Aplicar buenas prácticas' => 'Mejora continua en la comunicación efectiva y segura.',
            'Proyecto final' => 'Aplica lo aprendido en un proyecto real.',
        ],
    ],
];

$add = function (stdClass $course, string $modname, string $name, int $section, array $extra) use ($DB) {
    foreach (get_fast_modinfo($course)->get_cms() as $cm) {
        if ($cm->name === $name) {
            return;
        }
    }
    $module = $DB->get_record('modules', ['name' => $modname], '*', MUST_EXIST);
    add_moduleinfo((object) array_merge([
        'modulename' => $modname, 'module' => $module->id, 'name' => $name, 'section' => $section,
        'visible' => 1, 'visibleoncoursepage' => 1, 'cmidnumber' => '', 'groupmode' => 0, 'groupingid' => 0,
        'introeditor' => ['text' => '', 'format' => FORMAT_HTML, 'itemid' => 0],
        'completion' => COMPLETION_TRACKING_MANUAL,
    ], $extra), $course);
};

foreach ($courses as $shortname => $def) {
    $course = $DB->get_record('course', ['shortname' => $shortname]);
    if (!$course) {
        $course = create_course((object) [
            'fullname' => $def['fullname'], 'shortname' => $shortname, 'idnumber' => $shortname,
            'category' => $category->id, 'summary' => $def['summary'], 'summaryformat' => FORMAT_HTML,
            'format' => 'topics', 'numsections' => count($def['sections']), 'enablecompletion' => 1, 'visible' => 1,
        ]);
    }
    $number = 1;
    foreach ($def['sections'] as $title => $summary) {
        $section = $DB->get_record('course_sections', ['course' => $course->id, 'section' => $number]);
        if ($section) {
            $DB->update_record('course_sections', (object) [
                'id' => $section->id, 'name' => $title, 'summary' => "<p>$summary</p>", 'summaryformat' => FORMAT_HTML,
            ]);
        }
        $number++;
    }
    $intro = "<p>{$def['summary']}</p>";
    $add($course, 'page', 'Presentación del curso', 0, [
        'page' => ['text' => $intro, 'format' => FORMAT_HTML, 'itemid' => 0],
        'content' => $intro, 'contentformat' => FORMAT_HTML, 'display' => 5, 'printintro' => 0, 'printlastmodified' => 0,
    ]);
    $add($course, 'assign', 'Proyecto final', count($def['sections']), [
        'introeditor' => ['text' => '<p>Entrega del proyecto final del curso.</p>', 'format' => FORMAT_HTML, 'itemid' => 0],
        'submissiondrafts' => 0, 'requiresubmissionstatement' => 0, 'sendnotifications' => 0, 'sendlatenotifications' => 0,
        'sendstudentnotifications' => 1, 'duedate' => time() + 30 * DAYSECS, 'cutoffdate' => 0, 'gradingduedate' => 0,
        'allowsubmissionsfromdate' => 0, 'grade' => 100, 'teamsubmission' => 0, 'requireallteammemberssubmit' => 0,
        'blindmarking' => 0, 'markingworkflow' => 0, 'markingallocation' => 0, 'attemptreopenmethod' => 'none',
        'maxattempts' => -1, 'assignsubmission_onlinetext_enabled' => 1, 'assignsubmission_file_enabled' => 1,
        'assignsubmission_file_maxfiles' => 3, 'assignsubmission_file_maxsizebytes' => 10 * 1024 * 1024,
    ]);
    rebuild_course_cache($course->id, true);
    cli_writeln("$shortname=" . $course->id);
}

// Curso y categoria de demostracion de la primera etapa.
if ($demo = $DB->get_record('course', ['shortname' => 'IIN-101'])) {
    delete_course($demo, false);
    cli_writeln('Curso de demostración IIN-101 eliminado');
}
if ($democat = $DB->get_record('course_categories', ['idnumber' => 'IINICIA-DEMO'])) {
    $cat = \core_course_category::get($democat->id);
    if ($cat->can_delete_full() && !$cat->has_courses() && !$cat->has_children()) {
        $cat->delete_full(false);
    }
}
